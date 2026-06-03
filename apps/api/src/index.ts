// Importing env first triggers dotenv loading + zod validation (fail-fast on
// invalid configuration) before anything else runs.
import { env } from "./env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`api listening on :${env.PORT}`);
});
