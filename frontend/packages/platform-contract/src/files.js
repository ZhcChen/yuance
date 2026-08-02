// @ts-check

/** @type {unique symbol} */
const FILE_CAPABILITY = Symbol('FileCapability');
/** @type {unique symbol} */
const SIGNED_TRANSFER_CAPABILITY = Symbol('SignedTransferCapability');
// brand symbol 保持私有，运行时声明只用于形成不可公开构造的 JSDoc 类型。
void FILE_CAPABILITY;
void SIGNED_TRANSFER_CAPABILITY;

/** @typedef {{ readonly [FILE_CAPABILITY]: true }} FileCapability */

/**
 * 由宿主验证服务端响应后签发的受控传输 capability。共享层不得解析或构造。
 *
 * @typedef {{ readonly [SIGNED_TRANSFER_CAPABILITY]: true }} SignedTransferCapability
 */

/**
 * 宿主选择的文件。`capability` 是宿主私有的不透明值，共享层不得解析或构造。
 * 宿主执行操作时必须重新验证 capability 的签发者、归属、用途、有效期和消费状态，
 * 且不得信任调用方回传的展示元数据。
 *
 * @typedef {object} SelectedFile
 * @property {FileCapability} capability
 * @property {string} filename
 * @property {string} contentType
 * @property {number} byteSize
 */

/**
 * @typedef {object} FileCapabilities
 * @property {() => Promise<SelectedFile | null>} chooseFile
 * @property {(transfer: SignedTransferCapability, fileCapability: FileCapability) => Promise<void>} uploadSignedRequest
 */

/**
 * @typedef {object} DownloadCapabilities
 * @property {(transfer: SignedTransferCapability, suggestedFilename: string) => Promise<void>} downloadSignedRequest
 */

/**
 * @typedef {object} TransferCapabilities
 * @property {(signedRequest: unknown) => SignedTransferCapability} authorizeSignedRequest
 */

/**
 * @param {Partial<FileCapabilities>} capabilities
 * @returns {FileCapabilities}
 */
export function defineFileCapabilities(capabilities) {
  requireObject(capabilities);
  requireOperation(capabilities, 'chooseFile');
  requireOperation(capabilities, 'uploadSignedRequest');
  return /** @type {FileCapabilities} */ (capabilities);
}

/**
 * @param {Partial<DownloadCapabilities>} capabilities
 * @returns {DownloadCapabilities}
 */
export function defineDownloadCapabilities(capabilities) {
  requireObject(capabilities);
  requireOperation(capabilities, 'downloadSignedRequest');
  return /** @type {DownloadCapabilities} */ (capabilities);
}

/**
 * @param {Partial<TransferCapabilities>} capabilities
 * @returns {TransferCapabilities}
 */
export function defineTransferCapabilities(capabilities) {
  requireObject(capabilities);
  requireOperation(capabilities, 'authorizeSignedRequest');
  return /** @type {TransferCapabilities} */ (capabilities);
}

/**
 * Desktop 宿主委托能力。renderer 只能回传 file capability，不能取得或构造 signed request。
 *
 * @typedef {object} HostDelegatedFileCapabilities
 * @property {() => Promise<SelectedFile | null>} chooseFile
 * @property {(fileCapability: FileCapability) => Promise<{status: string, byteSize?: number}>} uploadCanary
 * @property {() => Promise<{status: string, byteSize?: number, filename?: string}>} downloadCanary
 */

/**
 * @param {Partial<HostDelegatedFileCapabilities>} capabilities
 * @returns {HostDelegatedFileCapabilities}
 */
export function defineHostDelegatedFileCapabilities(capabilities) {
  requireObject(capabilities);
  requireOperation(capabilities, 'chooseFile');
  requireOperation(capabilities, 'uploadCanary');
  requireOperation(capabilities, 'downloadCanary');
  return /** @type {HostDelegatedFileCapabilities} */ (capabilities);
}

/**
 * @param {object} capabilities
 * @param {string} operation
 */
function requireOperation(capabilities, operation) {
  if (typeof capabilities[operation] !== 'function') {
    throw new TypeError(`platform capability requires ${operation}()`);
  }
}

/** @param {unknown} capabilities */
function requireObject(capabilities) {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new TypeError('platform capabilities must be an object');
  }
}
