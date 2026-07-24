import { Module } from '@nestjs/common';
import { createSupabaseServerClient, SUPABASE_CLIENT } from './supabase.client';

@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: createSupabaseServerClient,
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class DatabaseModule {}
