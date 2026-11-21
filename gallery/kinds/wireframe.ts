import { Scene } from '../../src/index.ts';
import {
  browserFrame,
  button,
  callouts,
  card,
  checkbox,
  divider,
  imagePlaceholder,
  inputHeight,
  link,
  navBar,
  phoneFrame,
  row,
  stack,
  textInput,
  textLines
} from '../../src/layouts/wireframe.ts';

const s = new Scene();
s.title(30, 20, 'Sign in: desktop and phone');

// ---- desktop ----
const page = browserFrame(s, { x: 30, y: 80, w: 840, h: 680 }, { title: 'Sign in · Harbour Parking', url: 'https://harbourparking.co.uk/account/sign-in' });
const [nav, body] = stack(page, [58, -1], 0);
navBar(s, nav!, { brand: 'Harbour Parking', links: ['Airports', 'Ports', 'Help'], cta: 'Manage booking' });
const [hero, form] = row({ ...body!, x: body!.x + 28, w: body!.w - 56, y: body!.y + 28, h: body!.h - 56 }, [-1, 360], 32);
imagePlaceholder(s, { ...hero!, h: hero!.h - 110 }, { caption: 'Car park photo' });
textLines(s, { ...hero!, y: hero!.y + hero!.h - 80, h: 80 }, { lines: 3 });

const inner = card(s, form!, { title: 'Sign in' });
const [email, password, opts, submit, or, google, footer] = stack(inner, [inputHeight(), inputHeight(), 26, 44, 22, 44, 24], 14);
const emailField = textInput(s, email!, { label: 'Email', placeholder: 'you@example.com' });
const passField = textInput(s, password!, { label: 'Password', value: 'hunter22', password: true, trailing: 'Show' });
const [remember, forgot] = row(opts!, [-1, 150], 8);
checkbox(s, remember!, 'Remember me', { checked: true });
link(s, forgot!, 'Forgot password?', { align: 'right' });
const signIn = button(s, submit!, 'Sign in', { primary: true });
divider(s, or!, 'or');
const sso = button(s, google!, 'Continue with Google');
link(s, footer!, 'New here? Create an account', { align: 'center' });

// ---- phone ----
const screen = phoneFrame(s, { x: 1190, y: 80, w: 320, h: 680 });
const [pnav, pbody] = stack(screen, [48, -1], 0);
navBar(s, pnav!, { brand: 'Harbour', cta: 'Menu' });
const pin = { x: pbody!.x + 20, y: pbody!.y + 22, w: pbody!.w - 40, h: pbody!.h - 30 };
const [ph, pe, pp, po, ps, por, pg, pf] = stack(pin, [32, inputHeight(), inputHeight(), 26, 44, 22, 44, 24], 14);
s.text('Sign in', ph!.x, ph!.y, { size: 22 });
textInput(s, pe!, { label: 'Email', placeholder: 'you@example.com' });
textInput(s, pp!, { label: 'Password', placeholder: 'Password', trailing: 'Show' });
checkbox(s, po!, 'Remember me');
button(s, ps!, 'Sign in', { primary: true });
divider(s, por!, 'or');
const psso = button(s, pg!, 'Continue with Google');
link(s, pf!, 'Forgot password?', { align: 'center' });

// ---- callouts in the column between the two ----
callouts(
  s,
  [
    { at: [emailField.x + emailField.width, emailField.y], text: 'Email is checked when the field loses focus, not on every key.' },
    { at: [passField.x + passField.width, passField.y], text: '"Show" toggles the password; the field stays type=password otherwise.' },
    { at: [signIn.x + signIn.width, signIn.y], text: 'Stays enabled; errors appear under the field that caused them.' },
    { at: [psso.x, psso.y], n: 4, text: 'On phones the photo and the nav links go; "Menu" holds them.' }
  ],
  { x: 916, y: 120, w: 236 }
);

export const wireframeSignIn = s;
export const wireframeNote =
  'Wireframe kit: a sign-in page in a browser frame and on a phone, composed from boxes with stack/row/inset; four callouts stack in a margin column level with their markers so the dashed lines run flat. Button, tab and marker text is bound to its shape (fit-checked); other text is measured and cut with an ellipsis instead of spilling, and stack/row throw when the rows do not fit their box. Limits: the fit check has little to say about wireframes (nothing is a node), so the preview is the real test; callout lines are straight and are not routed round controls; notes for markers right of the column are right-aligned.';
