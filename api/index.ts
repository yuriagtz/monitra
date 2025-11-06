import type { IncomingMessage, ServerResponse } from "http";
// @ts-expect-error dist/index.js はビルド生成物のため型定義が存在しません
import handler from "../dist/index.js";

export default handler as (
  req: IncomingMessage,
  res: ServerResponse
) => unknown;

