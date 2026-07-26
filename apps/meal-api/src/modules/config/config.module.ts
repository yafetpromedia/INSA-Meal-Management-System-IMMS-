import { Global, Module } from '@nestjs/common';
import { ConfigResolutionService } from './config-resolution.service';
import { PlatformConfigController } from './platform-config.controller';

@Global()
@Module({
  controllers: [PlatformConfigController],
  providers: [ConfigResolutionService],
  exports: [ConfigResolutionService],
})
export class PlatformConfigModule {}
