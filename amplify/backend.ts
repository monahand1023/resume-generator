import { defineBackend } from '@aws-amplify/backend';
import { customizeResume } from './functions/customize-resume/resource';

export const backend = defineBackend({
    customizeResume,
});