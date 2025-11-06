import type { IncomingMessage, ServerResponse } from "http";
import handler from "../dist/index.js";

export default handler as (
  req: IncomingMessage,
  res: ServerResponse
) => unknown;

