// Patch Response.json() to return any so pre-existing API call sites
// don't require explicit type assertions. TypeScript 5.x changed the
// return type to unknown, but this codebase predates that change.
interface Response {
  json(): Promise<any>;
}
