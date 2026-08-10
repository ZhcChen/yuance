import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectResourceWithAttachments } from '@yuance/frontend-app-core';

const file = { capability: {}, filename: 'design.png', contentType: 'image/png', byteSize: 7 };

test('project resource creation uploads attachments then patches canonical inline body once', async () => {
  const calls = [];
  const pending = { id: 9, status: 'pending' };
  const uploaded = { id: 9, status: 'uploaded' };
  const resource = { id: 8, body: '<p>正文</p>' };
  const result = await createProjectResourceWithAttachments({
    api: {
      createProjectResource: async (_projectKey, payload) => { calls.push(['create-resource', payload.body]); return resource; },
      createProjectResourceAttachment: async () => { calls.push(['create-attachment']); return pending; },
      getProjectResourceAttachmentUploadUrl: async () => { calls.push(['sign']); return { request: {}, expires_in_seconds: 60 }; },
      markProjectResourceAttachmentUploaded: async () => { calls.push(['confirm']); return uploaded; },
      updateProjectResource: async (_projectKey, _resourceId, payload) => { calls.push(['update-body', payload.body]); return { ...resource, body: payload.body }; },
    },
    platform: browserPlatform(calls),
    projectKey: 'YCE', payload: { body: '<p>正文</p>', bodyFormat: 'html' },
    attachments: [{ file, inlineHtml: (created, attachment) => `<img data-resource="${created.id}" data-attachment="${attachment.id}">` }],
    lifecycle: lifecycle(calls),
  });

  assert.equal(result.completed, true);
  assert.deepEqual(calls.map(([name]) => name), ['create-resource', 'resource-created', 'stage:registering', 'create-attachment', 'attachment-created', 'stage:signing', 'sign', 'stage:uploading', 'upload', 'stage:confirming', 'confirm', 'attachment-uploaded', 'update-body', 'body-saved']);
  assert.equal(result.resource.body, '<p>正文</p><img data-resource="8" data-attachment="9">');
});

test('project resource creation resumes without duplicating resource or uploaded attachments', async () => {
  const calls = [];
  const resource = { id: 8, body: '<p>正文</p>' };
  const uploaded = { id: 9, status: 'uploaded' };
  const result = await createProjectResourceWithAttachments({
    api: {
      createProjectResource: async () => { throw new Error('must not create twice'); },
      updateProjectResource: async (_projectKey, _resourceId, payload) => { calls.push(['update-body']); return { ...resource, body: payload.body }; },
    },
    platform: {}, projectKey: 'YCE', payload: { body: '<p>正文</p>' }, resource,
    attachments: [{ uploadedAttachment: uploaded, inlineHtml: (_created, attachment) => `<a data-id="${attachment.id}">附件</a>` }],
    lifecycle: lifecycle(calls),
  });
  assert.equal(result.completed, true);
  assert.deepEqual(calls.map(([name]) => name), ['update-body', 'body-saved']);
});

test('project resource creation exposes committed resource before an attachment failure', async () => {
  const calls = [];
  const resource = { id: 8, body: '<p>正文</p>' };
  await assert.rejects(createProjectResourceWithAttachments({
    api: {
      createProjectResource: async () => resource,
      createProjectResourceAttachment: async () => { throw new Error('register failed'); },
    },
    platform: browserPlatform(calls), projectKey: 'YCE', payload: { body: '<p>正文</p>' }, attachments: [{ file }], lifecycle: lifecycle(calls),
  }), /register failed/);
  assert.deepEqual(calls.slice(0, 3).map(([name]) => name), ['resource-created', 'stage:registering', 'attachment-created'].filter((name) => name !== 'attachment-created'));
  assert.equal(calls[0][1], resource);
});

test('project resource creation delegates desktop attachment bytes without renderer signing', async () => {
  const calls = [];
  const resource = { id: 8, body: '<p>正文</p>' };
  const pending = { id: 9, status: 'pending' };
  const uploaded = { id: 9, status: 'uploaded' };
  const result = await createProjectResourceWithAttachments({
    api: {
      createProjectResource: async () => resource,
      createProjectResourceAttachment: async () => { throw new Error('renderer must not register'); },
      getProjectResourceAttachmentUploadUrl: async () => { throw new Error('renderer must not sign'); },
      markProjectResourceAttachmentUploaded: async () => { throw new Error('renderer must not confirm'); },
      updateProjectResource: async (_projectKey, _resourceId, payload) => ({ ...resource, body: payload.body }),
    },
    platform: {
      attachments: {
        uploadProjectResourceAttachment: async (input, onStage) => {
          calls.push(['delegate', input]);
          for (const stage of ['registering', 'signing', 'uploading', 'confirming']) onStage(stage);
          return { created: pending, uploaded };
        },
      },
    },
    projectKey: 'YCE', payload: { body: '<p>正文</p>' }, attachments: [{ file }], lifecycle: lifecycle(calls),
  });
  assert.equal(result.completed, true);
  assert.deepEqual(calls[1], ['delegate', { projectKey: 'YCE', resourceId: 8, fileCapability: file.capability }]);
});

function lifecycle(calls) {
  return {
    isCurrent: () => true,
    onResourceCreated: (resource) => calls.push(['resource-created', resource]),
    onAttachmentStage: (_index, stage) => calls.push([`stage:${stage}`]),
    onAttachmentCreated: (_index, attachment) => calls.push(['attachment-created', attachment]),
    onAttachmentUploaded: (_index, attachment) => calls.push(['attachment-uploaded', attachment]),
    onBodySaved: (resource) => calls.push(['body-saved', resource]),
  };
}

function browserPlatform(calls) {
  const transfer = {};
  return {
    transfers: { authorizeSignedRequest: () => transfer },
    files: { uploadSignedRequest: async (authorized) => { assert.equal(authorized, transfer); calls.push(['upload']); } },
  };
}
