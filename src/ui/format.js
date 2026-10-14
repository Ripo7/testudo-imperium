import { FACTIONS, RES, sigOf } from '../game/data.js';

/* =========================================================
   Icons & formatting
   ========================================================= */
export const IC = {
  gold: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f2c14e" stroke="#9a6d12" stroke-width="2"/><path d="M12 6.5v11M9.3 9.3h4.2a1.6 1.6 0 0 1 0 3.2h-3a1.6 1.6 0 0 0 0 3.2h4.4" stroke="#7d540c" stroke-width="1.6" fill="none"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M12 22V7" stroke="#caa04b" stroke-width="2"/><g fill="#ecc767"><ellipse cx="9" cy="10" rx="2" ry="3.3" transform="rotate(-30 9 10)"/><ellipse cx="15" cy="10" rx="2" ry="3.3" transform="rotate(30 15 10)"/><ellipse cx="9" cy="15.5" rx="2" ry="3.3" transform="rotate(-30 9 15.5)"/><ellipse cx="15" cy="15.5" rx="2" ry="3.3" transform="rotate(30 15 15.5)"/><ellipse cx="12" cy="5" rx="1.8" ry="3"/></g></svg>',
  wood: '<svg viewBox="0 0 24 24"><rect x="2.5" y="12.5" width="19" height="6" rx="3" fill="#8f6238"/><rect x="5" y="6" width="16.5" height="6" rx="3" fill="#ad7a48"/><circle cx="5.5" cy="15.5" r="2.3" fill="#e2bb8b"/><circle cx="8" cy="9" r="2.3" fill="#e2bb8b"/></svg>',
  stone: '<svg viewBox="0 0 24 24"><path d="M2.5 19.5l3.2-7.4 5.2-2.1 3.1 3 4.3-1.2 3.2 7.7z" fill="#9f9a92"/><path d="M8 11.5l3.2-5.7 4.3 2.2 1 5.1" fill="#cbc5bc"/></svg>',
  spear: '<svg viewBox="0 0 24 24"><path d="M4.5 21.5 18.5 5.5" stroke="#d8c39b" stroke-width="2"/><path d="M17 2.5h4.5V7l-2.8 1.6-3.3-3.3z" fill="#d3d9e0"/><circle cx="8.5" cy="15" r="4.4" fill="rgba(255,255,255,.12)" stroke="#e8dcc4" stroke-width="1.6"/></svg>',
  leg: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.6" fill="#c8342b" stroke="#f2c14e" stroke-width="1.5"/><circle cx="12" cy="12" r="2.1" fill="#ececec"/><path d="M12 4.5v5M12 14.5v5" stroke="#f2c14e" stroke-width="1.2"/></svg>',
  arch: '<svg viewBox="0 0 24 24"><path d="M6.5 2.5c7 3 10 6.4 10 9.5s-3 6.5-10 9.5" fill="none" stroke="#c99a5a" stroke-width="2.2"/><path d="M6.5 2.5v19" stroke="#eee" stroke-width="1"/><path d="M3 12h16.5m-2.4-2.4L19.5 12l-2.4 2.4" stroke="#e8dcc4" stroke-width="1.6" fill="none"/></svg>',
  cav: '<svg viewBox="0 0 24 24"><path d="M6.5 21.5l1.3-6.3-3.3-3.1 2.4-5.4 5.3-3.2 5.4 2.2 3.4 6.5-3.3 1.1-2.1-2-2.2 3.2 1.1 7z" fill="#c49a6c"/><circle cx="13.7" cy="7.9" r="1.1" fill="#222"/><path d="M11.5 3.5l1.5-2" stroke="#c49a6c" stroke-width="2"/></svg>',
  siege: '<svg viewBox="0 0 24 24"><rect x="2.5" y="14.5" width="17" height="3.2" rx="1" fill="#9a6b3f"/><circle cx="6" cy="19" r="2.3" fill="#5a3d26"/><circle cx="16" cy="19" r="2.3" fill="#5a3d26"/><path d="M8 14.5 18.5 4.5" stroke="#b07c4a" stroke-width="2.2"/><circle cx="19.5" cy="3.8" r="2.2" fill="#8c8c8c"/></svg>',
  walls: '<svg viewBox="0 0 24 24"><path d="M2.5 21V8.5h3.2v2.4h3V8.5h3.4v2.4h3V8.5h3.4v2.4h3V8.5h1V21z" fill="#d8ccb1"/></svg>',
  men: '<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="3" fill="#ddd"/><circle cx="16" cy="7" r="3" fill="#ddd"/><path d="M2 20c0-4 2.7-7 6-7s6 3 6 7zM10 20c0-4 2.7-7 6-7s6 3 6 7z" fill="#ddd"/></svg>',
  fort: '<svg viewBox="0 0 24 24"><path d="M4 21V9l2-2 2 2v3h8V9l2-2 2 2v12z" fill="#b08a5c"/><rect x="10" y="15" width="4" height="6" fill="#5b3d26"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5.5v6c0 5 3.4 8.8 8 10.5 4.6-1.7 8-5.5 8-10.5v-6z" fill="#9fd8ff"/></svg>',
  sword: '<svg viewBox="0 0 24 24"><path d="M14.5 3.5 21 3l-.5 6.5L9 21l-2-2-2 2-1-1 2-2-2-2z" fill="#e6e6e6"/></svg>',
  ele: '<svg viewBox="0 0 24 24"><rect x="5.2" y="3" width="6.6" height="3.8" rx=".8" fill="#ad7bff" stroke="#f2c14e" stroke-width=".9"/><path d="M3 17v-5.6C3 8.6 5.4 6.8 8.6 6.8h4.9c2.5 0 4.4 1.6 5 3.8l.7 2.6c.3 1.2 1 2 2.1 2.5l-.4 1.7c-1.9-.4-3.2-1.6-3.7-3.4l-.1-.5V20h-2.9v-3.2H8V20H5.2v-3z" fill="#a39d95"/><path d="M15.2 13c1.3.1 2.4-.3 3.1-1" stroke="#f3ecdc" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="15.4" cy="9.4" r=".9" fill="#222"/></svg>',
  gae: '<svg viewBox="0 0 24 24"><ellipse cx="9.5" cy="12" rx="5.3" ry="9.2" fill="#3b78e0" stroke="#e8dcc4" stroke-width="1.4"/><circle cx="9.5" cy="12" r="1.8" fill="#f2c14e"/><path d="M15.2 21 20.8 4.2" stroke="#d3d9e0" stroke-width="2.2"/><path d="M14 17.8l3.1 1" stroke="#f2c14e" stroke-width="1.7"/></svg>',
  char: '<svg viewBox="0 0 24 24"><path d="M2.5 7.5h11l-1.7 6.6H4.4z" fill="#e8a40c"/><circle cx="8.6" cy="16.3" r="4.6" fill="none" stroke="#c49a6c" stroke-width="1.8"/><path d="M8.6 11.7v9.2M4 16.3h9.2M5.4 13.1l6.4 6.4M11.8 13.1l-6.4 6.4" stroke="#c49a6c" stroke-width="1"/><path d="M13 10.2h8.5" stroke="#c49a6c" stroke-width="1.6"/><path d="M17.6 4.6c2.2 1.4 2.9 3.8 2.2 6" stroke="#e8dcc4" stroke-width="1.6" fill="none"/></svg>',
};
export const icOf = (t, f) => IC[t === 'leg' ? sigOf(f).key : t];
export const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const fmtRate = (r) => (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(1);
export const fcss = (o) => (o >= 0 ? FACTIONS[o].css : '#a39d92');
export const RCOL = { gold: '#f2c14e', food: '#9fd36a', wood: '#c08a55', stone: '#b9b3aa' };
export const costMini = (F, cost) => '<span class="cst">' + RES.filter((r) => cost[r]).map((r) => `<span class="${F.res[r] < cost[r] ? 'no' : ''}" style="--c:${RCOL[r]}" title="${r}">${cost[r]}</span>`).join('') + '</span>';
export const costHtml = (F, cost, k = 1) => RES.filter((r) => cost[r]).map((r) => `<span class="${F.res[r] < cost[r] * k ? 'no' : ''}">${Math.round(cost[r] * k)} ${r}</span>`).join(' · ');
export const oddsWord = (p) => (p >= 0.8 ? ['Decisive', 'good'] : p >= 0.6 ? ['Favorable', 'good'] : p >= 0.42 ? ['Even fight', 'even'] : p >= 0.2 ? ['Risky', 'bad'] : ['Suicidal', 'bad']);
