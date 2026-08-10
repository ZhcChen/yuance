// @ts-check

import { uploadProjectResourceAttachment } from './work-item-collaboration.js';

/**
 * @template {{ id: number }} R
 * @template {{ id: number }} A
 * @param {{
 *   api: any,
 *   platform: any,
 *   projectKey: string,
 *   payload: any,
 *   resource?: R | null,
 *   attachments: Array<{ file?: any, existingAttachment?: A | null, uploadedAttachment?: A | null, inlineHtml?: (resource: R, attachment: A) => string }>,
 *   lifecycle: {
 *     isCurrent(): boolean,
 *     onResourceCreated(resource: R): void,
 *     onAttachmentStage(index: number, stage: 'registering' | 'signing' | 'uploading' | 'confirming'): void,
 *     onAttachmentCreated(index: number, attachment: A): void,
 *     onAttachmentUploaded(index: number, attachment: A): void,
 *     onBodySaved(resource: R): void,
 *   },
 * }} options
 */
export async function createProjectResourceWithAttachments({ api, platform, projectKey, payload, resource: existingResource = null, attachments, lifecycle }) {
  const initialResource = /** @type {R} */ (existingResource || await api.createProjectResource(projectKey, payload));
  let currentResource = initialResource;
  if (!existingResource) lifecycle.onResourceCreated(initialResource);
  if (!lifecycle.isCurrent()) return { completed: false, resource: currentResource, attachments: attachments.map((entry) => entry.uploadedAttachment || entry.existingAttachment || null) };

  const uploadedAttachments = [];
  for (const [index, entry] of attachments.entries()) {
    let uploaded = entry.uploadedAttachment || null;
    if (!uploaded) {
      if (!entry.file) throw new Error('请重新选择待上传附件。');
      const result = await uploadProjectResourceAttachment({
        api,
        platform,
        projectKey,
        resourceId: currentResource.id,
        file: entry.file,
        existingAttachment: entry.existingAttachment || null,
        lifecycle: {
          isCurrent: lifecycle.isCurrent,
          onStage: (stage) => lifecycle.onAttachmentStage(index, stage),
          onCreated: (attachment) => lifecycle.onAttachmentCreated(index, attachment),
          onUploaded: (attachment) => lifecycle.onAttachmentUploaded(index, attachment),
          refresh: async () => {},
        },
      });
      uploaded = result.uploaded;
      if (!result.completed) return { completed: false, resource: currentResource, attachments: [...uploadedAttachments, uploaded] };
    }
    uploadedAttachments.push(uploaded);
  }

  const inlineHtml = attachments.map((entry, index) => entry.inlineHtml?.(currentResource, uploadedAttachments[index]) || '').join('');
  if (inlineHtml) {
    currentResource = await api.updateProjectResource(projectKey, currentResource.id, { ...payload, body: `${payload.body}${inlineHtml}` });
    lifecycle.onBodySaved(currentResource);
  }
  return { completed: lifecycle.isCurrent(), resource: currentResource, attachments: uploadedAttachments };
}
