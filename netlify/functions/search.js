// Netlify Function: Search proxy
// File: netlify/functions/search.js

exports.handler = async (event) => {
  const query = event.queryStringParameters?.q;
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) };
  }

  const instances = [
    'https://invidious.materialio.us',
    'https://invidious.privacyredirect.com',
    'https://yt.cdaut.de',
    'https://invidious.protokolla.fi',
    'https://yewtu.be',
    'https://inv.tux.pizza',
  ];

  for (const instance of instances) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
      const resp = await fetch(url, { signal: 8000 });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data?.length) continue;

      const results = data.slice(0, 15).map(item => ({
        id: item.videoId,
        title: item.title,
        author: item.author || 'Unknown',
        duration: item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${(item.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
      }));

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(results),
      };
    } catch (e) {
      continue;
    }
  }

  return {
    statusCode: 503,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: 'All search instances failed' }),
  };
};
