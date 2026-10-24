import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults are fine: listing pages render on each request (they read the
// database), so no incremental cache store is needed.
export default defineCloudflareConfig();
