import type { IncomingMessage, ServerResponse } from "http";
// dist/index.js は build 後に生成されるサーバレスハンドラー
export { default } from "../dist/index.js";

declare const _default: (req: IncomingMessage, res: ServerResponse) => unknown;
export default _default;

