import { getEnv } from "../config/env.js";
import { createSupabaseJobRepository } from "../repositories/supabaseJobRepository.js";
import { JobService } from "./jobService.js";

let cachedJobService: JobService | undefined;

export function getJobService(): JobService {
  if (!cachedJobService) {
    const env = getEnv();
    cachedJobService = new JobService(
      createSupabaseJobRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    );
  }
  return cachedJobService;
}

export function resetServiceContainerForTests(): void {
  cachedJobService = undefined;
}
