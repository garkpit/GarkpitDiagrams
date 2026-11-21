// fontkit ships no types; this is the one call the library makes.
declare module 'fontkit' {
  export function create(buffer: Buffer): unknown;
}
