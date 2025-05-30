import { defineBackend } from '@aws-amplify/backend';
import { customizeResume } from './functions/resume-generator/resource';

export const backend = defineBackend({
    customizeResume,
});