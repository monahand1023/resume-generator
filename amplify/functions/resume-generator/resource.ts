import { defineFunction } from '@aws-amplify/backend';

export const customizeResume = defineFunction({
    name: 'customize-resume',
    entry: './handler.ts',
    runtime: 20,
    timeoutSeconds: 60,
    memoryMB: 1024,
    bundling: {
        externalModules: ['@sparticuz/chromium'],
    },
});