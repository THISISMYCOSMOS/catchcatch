import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

describe('AnalysesController route validation', () => {
  it('rejects malformed analysis ids before repository lookup', async () => {
    const pipe = new ParseUUIDPipe({ version: '4' });

    await expect(pipe.transform('f902b912-c0aa-425d-8dc7-705277fffdc37', {
      type: 'param',
      metatype: String,
      data: 'analysisId',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
