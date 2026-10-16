import { IsIn } from 'class-validator';
import { ALL_STACK_IDS, TRACK_IDS } from '../../taxonomy/taxonomy';

/** Multipart text fields next to `file`. The applicant id always comes from the JWT, never from the body. */
export class UploadResumeDto {
    @IsIn(TRACK_IDS, { message: `targetTrack must be one of: ${TRACK_IDS.join(', ')}` })
    targetTrack: string;

    // the stack/track combination is checked in the service (needs both values)
    @IsIn(ALL_STACK_IDS, { message: `targetStack must be one of: ${ALL_STACK_IDS.join(', ')}` })
    targetStack: string;
}