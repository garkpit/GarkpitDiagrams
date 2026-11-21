import { sequence } from '../../src/layouts/sequence.ts';

export const sequenceScene = sequence({
  title: 'Sign in with OAuth, then call the API with token refresh',
  labelMaxPx: 220,
  participants: [
    { id: 'user', text: 'User', kind: 'pill' },
    { id: 'app', text: 'Web app' },
    { id: 'api', text: 'Orders API' },
    { id: 'auth', text: 'Auth server' }
  ],
  steps: [
    { from: 'user', to: 'app', text: 'Click "Sign in"' },
    { from: 'app', to: 'app', text: 'Make PKCE verifier and challenge' },
    { from: 'app', to: 'auth', text: 'Redirect to /authorize with the challenge', activate: true },
    { from: 'auth', to: 'user', text: 'Show the login page' },
    { from: 'user', to: 'auth', text: 'Email and password' },
    { from: 'auth', to: 'app', text: 'Redirect back with a one-time code', reply: true },
    { from: 'app', to: 'auth', text: 'POST /token (code + verifier)', activate: true },
    { from: 'auth', to: 'app', text: 'Access token (15 min) + refresh token', reply: true },
    { note: 'Tokens stay in memory, never in localStorage', at: 'app', side: 'left' },
    {
      frame: 'loop',
      label: '[each API call]',
      steps: [
        { from: 'app', to: 'api', text: 'GET /orders with Bearer token', activate: true },
        {
          frame: 'alt',
          label: '[token valid]',
          steps: [{ from: 'api', to: 'app', text: '200 orders', reply: true }],
          else: [
            {
              label: '[token expired]',
              steps: [
                { from: 'api', to: 'app', text: '401 Unauthorized', reply: true },
                { from: 'app', to: 'auth', text: 'POST /token (refresh token)', activate: true },
                { from: 'auth', to: 'app', text: 'New access token', reply: true },
                { from: 'app', to: 'api', text: 'Retry GET /orders', activate: true },
                { from: 'api', to: 'app', text: '200 orders', reply: true }
              ]
            }
          ]
        }
      ]
    },
    { from: 'app', to: 'user', text: 'Show the dashboard' }
  ]
});

export const sequenceNote =
  'sequence(): participants, dashed lifelines, calls and dashed replies, a self-message loop, activation bars, a side note, and a loop frame holding an alt with an else branch. Gaps grow from the measured labels, and plates take the tint of the frame behind them. A label over a long arrow is centred on it when, there, it clears every lifeline the arrow spans by the same margin as everywhere else (Show the login page and Email and password cross three gaps, so they sit over the middle one); otherwise it stays in the gap beside its sender (the app-to-Auth calls cross two gaps, whose midpoint is the Orders API lifeline). Lifelines and bars break under frame tags, guards and notes, so no text has a line through it. Alt sections each start from the activation state the frame began with, which is why the API bar resumes under [token expired]. Limits: activation follows a simple stack (activate opens, the next reply from that participant closes); gaps are still sized for the beside-the-sender placement, so centring never makes a diagram narrower; and a long diagram is tall, so print it portrait (labels wrap at 220 px here to keep it legible on A4 portrait).';
