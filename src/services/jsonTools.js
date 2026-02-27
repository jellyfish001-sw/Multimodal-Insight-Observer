// ── YouTube/JSON Channel Data Tools ──────────────────────────────────────────
// Tool declarations for Gemini function calling when channel JSON is loaded.
// Tools: compute_stats_json, plot_metric_vs_time, play_video

const COL_NOTE = 'Use the exact field name as it appears in the JSON (e.g. view_count, like_count, comment_count, duration, release_date). Numeric duration is in seconds if available, otherwise use duration_iso.';

export const JSON_TOOL_DECLARATIONS = [
  {
    name: 'compute_stats_json',
    description:
      'Compute descriptive statistics (mean, median, std, min, max) for any numeric field in the channel JSON. ' +
      'Use when the user asks for statistics, average, or distribution of a numeric column. ' +
      'Common fields: view_count, like_count, comment_count, duration (seconds). ' + COL_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'Exact numeric field name from the JSON (e.g. view_count, like_count, comment_count).',
        },
      },
      required: ['field'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot any numeric field (views, likes, comments, etc.) vs time for the channel videos. ' +
      'Creates a line/area chart with release_date on X-axis and the metric on Y-axis. ' +
      'Use when user asks to visualize trends over time, plot metrics vs date, or see how views/likes evolved. ' + COL_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_field: {
          type: 'STRING',
          description: 'Numeric field to plot on Y-axis (e.g. view_count, like_count, comment_count).',
        },
        date_field: {
          type: 'STRING',
          description: 'Date field for X-axis. Usually "release_date". Default: release_date.',
        },
      },
      required: ['metric_field'],
    },
  },
  {
    name: 'play_video',
    description:
      'Display a clickable video card that opens the YouTube video in a new tab. ' +
      'Use when the user asks to "play", "open", or "watch" a video from the loaded channel data. ' +
      'The user can specify which video by: title (e.g. "play the asbestos video"), ordinal (e.g. "play the first video", "play video 3"), or "most viewed" (highest view_count).',
    parameters: {
      type: 'OBJECT',
      properties: {
        video_selector: {
          type: 'STRING',
          description: 'How to select the video: "first", "second", "third", etc. (ordinal), "most viewed", "least viewed", or a partial title match (e.g. "asbestos").',
        },
      },
      required: ['video_selector'],
    },
  },
];

// ── Resolve numeric field (handle snake_case and variations) ──────────────────
const resolveField = (rows, name) => {
  if (!rows.length || !name) return name;
  const keys = Object.keys(rows[0]);
  if (keys.includes(name)) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  return keys.find((k) => norm(k) === target) || name;
};

// Parse duration to seconds (for numeric stats)
const durationToSeconds = (val) => {
  if (val == null || val === '') return NaN;
  const n = parseFloat(val);
  if (!isNaN(n)) return n;
  const str = String(val);
  const ptMatch = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (ptMatch) {
    const h = parseInt(ptMatch[1] || 0, 10);
    const m = parseInt(ptMatch[2] || 0, 10);
    const s = parseInt(ptMatch[3] || 0, 10);
    return h * 3600 + m * 60 + s;
  }
  const colonMatch = str.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1] || 0, 10);
    const m = parseInt(colonMatch[2] || 0, 10);
    const s = parseInt(colonMatch[3] || 0, 10);
    return h * 3600 + m * 60 + s;
  }
  return NaN;
};

const median = (sorted) =>
  sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

const fmt = (n) => (Number.isInteger(n) ? n : +n.toFixed(4));

// ── Execute JSON tools ───────────────────────────────────────────────────────
export const executeJsonTool = (toolName, args, videos) => {
  if (!Array.isArray(videos) || !videos.length) {
    return { error: 'No channel JSON data loaded. Please drag a JSON file into the chat first.' };
  }

  switch (toolName) {
    case 'compute_stats_json': {
      const field = resolveField(videos, args.field);
      let vals = videos.map((r) => parseFloat(r[field]));
      if (vals.every(isNaN) && (field.toLowerCase().includes('duration') || field === 'duration_iso')) {
        vals = videos.map((r) => durationToSeconds(r[field] ?? r.duration ?? r.duration_iso));
      }
      vals = vals.filter((v) => !isNaN(v));
      if (!vals.length)
        return { error: `No numeric values in "${field}". Available: ${Object.keys(videos[0]).join(', ')}` };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: fmt(mean),
        median: fmt(median(sorted)),
        std: fmt(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const metricField = resolveField(videos, args.metric_field);
      const dateField = args.date_field ? resolveField(videos, args.date_field) : 'release_date';
      const data = videos
        .map((v) => {
          let metricVal = parseFloat(v[metricField]);
          if (isNaN(metricVal) && (metricField.toLowerCase().includes('duration') || metricField === 'duration_iso')) {
            metricVal = durationToSeconds(v[metricField] ?? v.duration ?? v.duration_iso);
          }
          const dateVal = v[dateField];
          if (dateVal == null || (isNaN(metricVal) && metricVal !== 0)) return null;
          return {
            date: dateVal,
            label: new Date(dateVal).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }),
            value: isNaN(metricVal) ? 0 : metricVal,
            title: v.title || '',
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!data.length)
        return { error: `Could not plot. Metric: "${metricField}", date: "${dateField}". Available: ${Object.keys(videos[0]).join(', ')}` };
      return {
        _chartType: 'metricVsTime',
        data,
        metricField,
        dateField,
      };
    }

    case 'play_video': {
      const sel = String(args.video_selector || '').toLowerCase().trim();
      let video = null;
      if (sel === 'most viewed' || sel === 'most viewed video') {
        video = [...videos].sort((a, b) => (parseInt(b.view_count, 10) || 0) - (parseInt(a.view_count, 10) || 0))[0];
      } else if (sel === 'least viewed' || sel === 'least viewed video') {
        video = [...videos].sort((a, b) => (parseInt(a.view_count, 10) || 0) - (parseInt(b.view_count, 10) || 0))[0];
      } else if (/^(first|1st|1)$/.test(sel)) {
        video = videos[0];
      } else if (/^(second|2nd|2)$/.test(sel)) {
        video = videos[1];
      } else if (/^(third|3rd|3)$/.test(sel)) {
        video = videos[2];
      } else if (/^(\d+)(st|nd|rd|th)?$/.test(sel)) {
        const idx = parseInt(sel.match(/\d+/)[0], 10) - 1;
        video = videos[idx];
      } else {
        video = videos.find((v) => (v.title || '').toLowerCase().includes(sel));
      }
      if (!video)
        return { error: `Video not found for "${args.video_selector}". Try "first", "most viewed", or a title keyword.` };
      return {
        _displayType: 'video',
        title: video.title || 'Untitled',
        thumbnail: video.thumbnail_url || null,
        url: video.video_url || `https://www.youtube.com/watch?v=${video.video_id}`,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
};
