export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Search endpoint: /s/QUERY
    if (path.startsWith('/s/')) {
      const query = path.slice(3).replace(/\+/g, ' ');
      
      try {
        // Get Spotify token
        const tokenRes = await fetch('https://spotify-nu-six.vercel.app/api/token');
        const tokenData = await tokenRes.json();
        
        // Search Spotify
        const searchRes = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        const searchData = await searchRes.json();
        
        const results = searchData.tracks.items.map(track => ({
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          artwork: track.album.images[0]?.url || '',
          id: track.id
        }));
        
        return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // Download endpoint: /d/SPOTIFY_ID
    if (path.startsWith('/d/')) {
      const spotifyId = path.slice(3);
      
      try {
        // Get Tidal URL from song.link
        const songLinkUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent('https://open.spotify.com/track/' + spotifyId)}`;
        const songLinkRes = await fetch(songLinkUrl);
        const songLinkData = await songLinkRes.json();
        
        const tidalUrl = songLinkData.linksByPlatform?.tidal?.url;
        if (!tidalUrl) {
          return new Response(JSON.stringify({ success: false, error: 'Tidal link not found' }), { 
            status: 404, 
            headers: corsHeaders 
          });
        }
        
        // Extract Tidal ID
        const tidalId = tidalUrl.match(/track\/(\d+)/)[1];
        
        // Get track details from song.link
        const tidalKey = `TIDAL_SONG::${tidalId}`;
        const trackInfo = songLinkData.entitiesByUniqueId?.[tidalKey];
        
        // Get audio URL from triton
        const tritonRes = await fetch(`https://triton.squid.wtf/track/?id=${tidalId}&quality=LOSSLESS`);
        const tritonData = await tritonRes.json();
        
        let streamUrl = null;
        
        // Check for direct URL
        if (tritonData[0]?.OriginalTrackUrl) {
          streamUrl = tritonData[0].OriginalTrackUrl;
        }
        // Check for manifest
        else if (tritonData.data?.manifest) {
          const manifestBase64 = tritonData.data.manifest;
          const manifestJson = atob(manifestBase64);
          const manifest = JSON.parse(manifestJson);
          
          if (manifest.urls && manifest.urls[0]) {
            streamUrl = manifest.urls[0];
          }
        }
        
        if (!streamUrl) {
          return new Response(JSON.stringify({ success: false, error: 'Stream URL not found' }), { 
            status: 404, 
            headers: corsHeaders 
          });
        }
        
        const result = {
          artist: trackInfo?.artistName || 'Unknown',
          song: trackInfo?.title || 'Unknown',
          artwork: trackInfo?.thumbnailUrl || '',
          streamUrl: streamUrl
        };
        
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

