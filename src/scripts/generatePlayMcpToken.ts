import dotenv from "dotenv";
import { createPlayMcpConfigToken } from "../auth/playMcpConfigToken.js";

dotenv.config({ quiet: true });

const token = createPlayMcpConfigToken(process.env);

process.stdout.write(`${token}\n`);
