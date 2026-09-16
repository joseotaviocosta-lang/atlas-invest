import { PipeTransform, ArgumentMetadata, Injectable } from '@nestjs/common';
import { UUIDSchema } from '@atlas/validation';

@Injectable()
export class UUIDParamPipe implements PipeTransform<string, string> {
  transform(value: string, _metadata: ArgumentMetadata): string {
    return UUIDSchema.parse(value);
  }
}
