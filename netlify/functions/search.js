// Netlify Function: YouTube Search via direct scraping
// File: netlify/functions/search.js

const https = require('https');
const http = require('http');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
        'DNT': '1',
      },
      timeout: 10000,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

exports.handler = async (event) => {
  const query = event.queryStringParameters?.q;
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) };
  }

  try {
    // Scrape YouTube search results directly
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' audio')}&sp=EgIQAQ%253D%253D`;
    const html = await fetchUrl(searchUrl);

    // Extract ytInitialData
    const match = html.match(/var ytInitialData = ({.+?});/s);
    if (!match) {
      // Try alternative pattern
      const match2 = html.match(/ytInitialData = ({.+?});/s);
      if (!match2) {
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Could not parse YouTube response' }),
        };
      }
    }

    const jsonStr = match ? match[1] : match2[1];
    const data = JSON.parse(jsonStr);

    // Navigate to video results
    const videos = [];
    try {
      const sections = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
      for (const section of sections) {
        const items = section.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const vr = item.videoRenderer;
          if (!vr) continue;

          const vid = vr.videoId;
          if (!vid) continue;

          const titleRuns = vr.title?.runs || [];
          const title = titleRuns[0]?.text || 'Unknown';

          const authorRuns = vr.ownerText?.runs || [];
          const author = authorRuns[0]?.text || 'Unknown';

          const lengthText = vr.lengthText?.simpleText || '';

          videos.push({
            id: vid,
            title: title,
            author: author,
            duration: lengthText,
          });
        }
      }
    } catch (e) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Parse error: ${e.message}` }),
      };
    }

    if (!videos.length) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No results found' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify(videos.slice(0, 15)),
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: `Search failed: ${e.message}` }),
    };
  }
};
