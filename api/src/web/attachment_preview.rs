#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachmentPreviewStrategy {
    Pdf,
    Text,
    Spreadsheet,
    Docx,
    Pptx,
    LegacyDoc,
    LegacyPpt,
    Document,
}

impl AttachmentPreviewStrategy {
    pub fn code(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Text => "text",
            Self::Spreadsheet => "spreadsheet",
            Self::Docx => "docx",
            Self::Pptx => "pptx",
            Self::LegacyDoc => "legacy-doc",
            Self::LegacyPpt => "legacy-ppt",
            Self::Document => "document",
        }
    }

    pub fn kind_label(self) -> &'static str {
        match self {
            Self::Pdf => "PDF",
            Self::Text => "文本",
            Self::Spreadsheet => "表格",
            Self::Docx | Self::LegacyDoc => "Word",
            Self::Pptx | Self::LegacyPpt => "演示",
            Self::Document => "文档",
        }
    }

    pub fn is_experimental(self) -> bool {
        false
    }

    pub fn is_enabled(self, _legacy_preview_enabled: bool) -> bool {
        true
    }
}

pub fn strategy(filename: &str, content_type: &str) -> Option<AttachmentPreviewStrategy> {
    let file_type = file_type(filename, content_type)?;
    match file_type {
        "pdf" => Some(AttachmentPreviewStrategy::Pdf),
        "csv" | "xls" | "xlsx" | "ods" => Some(AttachmentPreviewStrategy::Spreadsheet),
        "txt" | "log" | "md" | "json" | "xml" | "yaml" | "yml" => {
            Some(AttachmentPreviewStrategy::Text)
        }
        "docx" => Some(AttachmentPreviewStrategy::Docx),
        "pptx" => Some(AttachmentPreviewStrategy::Pptx),
        "doc" => Some(AttachmentPreviewStrategy::LegacyDoc),
        "ppt" => Some(AttachmentPreviewStrategy::LegacyPpt),
        _ if FILE_VIEWER_DOCUMENT_EXTENSIONS.contains(&file_type) => {
            Some(AttachmentPreviewStrategy::Document)
        }
        _ => None,
    }
}

const FILE_VIEWER_DOCUMENT_EXTENSIONS: &[&str] = &[
    "3dm",
    "3ds",
    "3mf",
    "7z",
    "aac",
    "ai",
    "amf",
    "apk",
    "ar",
    "asc",
    "asice",
    "asics",
    "avro",
    "bash",
    "bdl",
    "brep",
    "bundle",
    "bz2",
    "bzip2",
    "c",
    "cab",
    "cbr",
    "cbz",
    "cc",
    "cjs",
    "cms",
    "cmsc",
    "cpio",
    "cpp",
    "cs",
    "css",
    "csv",
    "dae",
    "dbf",
    "dcm",
    "dicom",
    "diff",
    "dio",
    "doc",
    "docm",
    "docx",
    "dot",
    "dotm",
    "dotx",
    "dra",
    "drawio",
    "dwf",
    "dwfx",
    "dwg",
    "dxf",
    "ear",
    "eml",
    "eps",
    "epub",
    "ers",
    "excalidraw",
    "fb2",
    "fbx",
    "flac",
    "fods",
    "gds",
    "geojson",
    "glb",
    "gltf",
    "go",
    "gpg",
    "gpx",
    "gv",
    "gz",
    "gzip",
    "h",
    "hcl",
    "hpp",
    "htm",
    "html",
    "http",
    "hwp",
    "hwpx",
    "ifc",
    "iges",
    "igs",
    "ini",
    "ipynb",
    "iso",
    "jar",
    "java",
    "js",
    "json",
    "json5",
    "jsonc",
    "jsx",
    "jws",
    "key",
    "kml",
    "kmz",
    "kt",
    "lha",
    "log",
    "lzh",
    "lzma",
    "m4a",
    "markdown",
    "mbox",
    "md",
    "mermaid",
    "mid",
    "midi",
    "mjs",
    "mmd",
    "mp3",
    "mpeg",
    "msg",
    "numbers",
    "oas",
    "oasis",
    "obj",
    "odp",
    "ods",
    "odt",
    "ofd",
    "oga",
    "ogg",
    "olb",
    "opus",
    "otf",
    "p7b",
    "p7c",
    "p7m",
    "p7s",
    "pages",
    "parquet",
    "patch",
    "pcd",
    "pdf",
    "pgp",
    "php",
    "pkcs7",
    "plantuml",
    "ply",
    "pot",
    "potm",
    "potx",
    "ppsm",
    "ppsx",
    "ppt",
    "pptm",
    "pptx",
    "proto",
    "psd",
    "puml",
    "py",
    "rar",
    "rb",
    "react",
    "rs",
    "rtf",
    "sce",
    "scs",
    "sh",
    "shp",
    "sig",
    "sql",
    "sqlite",
    "step",
    "stl",
    "stp",
    "swift",
    "tar",
    "tbz",
    "tbz2",
    "tex",
    "tgz",
    "toml",
    "ts",
    "tsd",
    "tsq",
    "tsr",
    "tst",
    "tsv",
    "tsx",
    "ttf",
    "txt",
    "txz",
    "typ",
    "typst",
    "tzst",
    "umd",
    "usd",
    "usda",
    "usdc",
    "usdz",
    "vrml",
    "vtk",
    "vtp",
    "vue",
    "war",
    "wasm",
    "wav",
    "weba",
    "webarchive",
    "woff",
    "woff2",
    "wp",
    "wp5",
    "wp6",
    "wpd",
    "wrl",
    "xar",
    "xla",
    "xlam",
    "xls",
    "xlsb",
    "xlsm",
    "xlsx",
    "xlt",
    "xltm",
    "xltx",
    "xmind",
    "xml",
    "xps",
    "xyz",
    "xz",
    "yaml",
    "yml",
    "zip",
    "zipx",
    "zst",
];

pub fn kind(
    filename: &str,
    content_type: &str,
    legacy_preview_enabled: bool,
) -> Option<&'static str> {
    if is_previewable_image(content_type)
        || (is_generic_content_type(content_type) && is_previewable_image_filename(filename))
    {
        return Some("image");
    }
    if is_previewable_video(content_type) {
        return Some("video");
    }
    strategy(filename, content_type)
        .filter(|value| value.is_enabled(legacy_preview_enabled))
        .map(|_| "document")
}

pub fn is_previewable_image(content_type: &str) -> bool {
    matches!(
        normalized_content_type(content_type).as_str(),
        "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp"
            | "image/bmp"
            | "image/avif"
            | "image/svg+xml"
    )
}

fn is_generic_content_type(content_type: &str) -> bool {
    matches!(
        normalized_content_type(content_type).as_str(),
        "" | "application/octet-stream"
    )
}

fn is_previewable_image_filename(filename: &str) -> bool {
    image_content_type_for_filename(filename).is_some()
}

pub fn image_content_type_for_filename(filename: &str) -> Option<&'static str> {
    match normalized_extension(filename).as_deref() {
        Some("avif") => Some("image/avif"),
        Some("bmp") => Some("image/bmp"),
        Some("gif") => Some("image/gif"),
        Some("jpeg" | "jpg") => Some("image/jpeg"),
        Some("png") => Some("image/png"),
        Some("svg") => Some("image/svg+xml"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

pub fn is_previewable_video(content_type: &str) -> bool {
    matches!(
        normalized_content_type(content_type).as_str(),
        "video/mp4" | "video/webm" | "video/ogg" | "video/quicktime"
    )
}

macro_rules! file_type_from_extension {
    ($filename:expr, $($extension:literal),+ $(,)?) => {
        match normalized_extension($filename).as_deref() {
            $(Some($extension) => Some($extension),)+
            _ => None,
        }
    };
}

pub fn file_type(filename: &str, content_type: &str) -> Option<&'static str> {
    match file_type_from_extension!(
        filename,
        "3dm",
        "3ds",
        "3mf",
        "7z",
        "aac",
        "ai",
        "amf",
        "apk",
        "ar",
        "asc",
        "asice",
        "asics",
        "avif",
        "avro",
        "bash",
        "bdl",
        "bmp",
        "brep",
        "bundle",
        "bz2",
        "bzip2",
        "c",
        "cab",
        "cbr",
        "cbz",
        "cc",
        "cjs",
        "cms",
        "cmsc",
        "cpio",
        "cpp",
        "cs",
        "css",
        "csv",
        "dae",
        "dbf",
        "dcm",
        "dicom",
        "diff",
        "dio",
        "doc",
        "docm",
        "docx",
        "dot",
        "dotm",
        "dotx",
        "dra",
        "drawio",
        "dwf",
        "dwfx",
        "dwg",
        "dxf",
        "ear",
        "eml",
        "eps",
        "epub",
        "ers",
        "excalidraw",
        "fb2",
        "fbx",
        "flac",
        "fods",
        "gds",
        "geojson",
        "gif",
        "glb",
        "gltf",
        "go",
        "gpg",
        "gpx",
        "gv",
        "gz",
        "gzip",
        "h",
        "hcl",
        "heic",
        "heif",
        "hpp",
        "htm",
        "html",
        "http",
        "hwp",
        "hwpx",
        "ico",
        "ifc",
        "iges",
        "igs",
        "ini",
        "ipynb",
        "iso",
        "jar",
        "java",
        "jpeg",
        "jpg",
        "js",
        "json",
        "json5",
        "jsonc",
        "jsx",
        "jws",
        "jxl",
        "key",
        "kml",
        "kmz",
        "kt",
        "lha",
        "log",
        "lzh",
        "lzma",
        "m3u8",
        "m4a",
        "markdown",
        "mbox",
        "md",
        "mermaid",
        "mid",
        "midi",
        "mjs",
        "mmd",
        "mp3",
        "mp4",
        "mpeg",
        "msg",
        "numbers",
        "oas",
        "oasis",
        "obj",
        "odp",
        "ods",
        "odt",
        "ofd",
        "oga",
        "ogg",
        "olb",
        "opus",
        "otf",
        "p7b",
        "p7c",
        "p7m",
        "p7s",
        "pages",
        "parquet",
        "patch",
        "pcd",
        "pdf",
        "pgp",
        "php",
        "pkcs7",
        "plantuml",
        "ply",
        "png",
        "pot",
        "potm",
        "potx",
        "ppsm",
        "ppsx",
        "ppt",
        "pptm",
        "pptx",
        "proto",
        "psd",
        "puml",
        "py",
        "rar",
        "rb",
        "react",
        "rs",
        "rtf",
        "sce",
        "scs",
        "sh",
        "shp",
        "sig",
        "sql",
        "sqlite",
        "step",
        "stl",
        "stp",
        "svg",
        "swift",
        "tar",
        "tbz",
        "tbz2",
        "tex",
        "tgz",
        "tif",
        "tiff",
        "toml",
        "ts",
        "tsd",
        "tsq",
        "tsr",
        "tst",
        "tsv",
        "tsx",
        "ttf",
        "txt",
        "txz",
        "typ",
        "typst",
        "tzst",
        "umd",
        "usd",
        "usda",
        "usdc",
        "usdz",
        "vrml",
        "vtk",
        "vtp",
        "vue",
        "war",
        "wasm",
        "wav",
        "weba",
        "webarchive",
        "webm",
        "webp",
        "woff",
        "woff2",
        "wp",
        "wp5",
        "wp6",
        "wpd",
        "wrl",
        "xar",
        "xla",
        "xlam",
        "xls",
        "xlsb",
        "xlsm",
        "xlsx",
        "xlt",
        "xltm",
        "xltx",
        "xmind",
        "xml",
        "xps",
        "xyz",
        "xz",
        "yaml",
        "yml",
        "zip",
        "zipx",
        "zst",
    ) {
        Some(extension) => Some(extension),
        None => file_type_from_content_type(content_type),
    }
}

fn normalized_extension(filename: &str) -> Option<String> {
    let (_, extension) = filename.trim().rsplit_once('.')?;
    let extension = extension.trim().to_ascii_lowercase();
    (!extension.is_empty()).then_some(extension)
}

fn file_type_from_content_type(content_type: &str) -> Option<&'static str> {
    match normalized_content_type(content_type).as_str() {
        "application/msword" => Some("doc"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
        "application/vnd.ms-excel" => Some("xls"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
        "application/vnd.oasis.opendocument.spreadsheet" => Some("ods"),
        "application/vnd.ms-powerpoint"
        | "application/powerpoint"
        | "application/x-mspowerpoint" => Some("ppt"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
        "application/pdf" => Some("pdf"),
        "text/plain" => Some("txt"),
        "text/markdown" => Some("md"),
        "text/csv" => Some("csv"),
        "application/json" => Some("json"),
        "application/xml" | "text/xml" => Some("xml"),
        "application/yaml" | "application/x-yaml" | "text/yaml" | "text/x-yaml" => Some("yaml"),
        _ => None,
    }
}

fn normalized_content_type(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_kind_covers_media_documents_and_legacy_files() {
        assert_eq!(
            image_content_type_for_filename("photo.png"),
            Some("image/png")
        );
        assert_eq!(
            image_content_type_for_filename("photo.jpeg"),
            Some("image/jpeg")
        );
        assert_eq!(
            image_content_type_for_filename("photo.svg"),
            Some("image/svg+xml")
        );
        assert_eq!(image_content_type_for_filename("photo.txt"), None);
        assert_eq!(kind("photo.png", "image/png", false), Some("image"));
        assert_eq!(kind("payload.svg", "image/svg+xml", false), Some("image"));
        assert_eq!(
            kind("photo.png", "application/octet-stream", false),
            Some("image")
        );
        assert_eq!(kind("photo.jpeg", "", false), Some("image"));
        assert_eq!(
            kind("clip.mp4", "video/mp4; codecs=avc1", false),
            Some("video")
        );
        assert_eq!(
            kind("guide.pdf", "application/pdf", false),
            Some("document")
        );
        assert_eq!(
            kind("legacy.doc", "application/msword", false),
            Some("document")
        );
        assert_eq!(
            kind("legacy.doc", "application/msword", true),
            Some("document")
        );
        assert_eq!(
            kind("legacy.ppt", "application/vnd.ms-powerpoint", false),
            Some("document")
        );
        assert_eq!(kind("说明.rtf", "application/rtf", false), Some("document"));
        assert_eq!(
            kind("压缩包.zip", "application/zip", false),
            Some("document")
        );
        assert_eq!(
            kind(
                "安装包.apk",
                "application/vnd.android.package-archive",
                false
            ),
            Some("document")
        );
        assert_eq!(
            kind(
                "表格.xlsm",
                "application/vnd.ms-excel.sheet.macroenabled.12",
                false
            ),
            Some("document")
        );
        assert_eq!(
            kind("旧版.dot", "application/msword", false),
            Some("document")
        );
        assert_eq!(
            kind("payload.svg", "application/octet-stream", false),
            Some("image")
        );
    }

    #[test]
    fn file_viewer_document_extensions_are_previewable() {
        assert_eq!(file_type("说明.rtf", ""), Some("rtf"));
        assert_eq!(file_type("压缩包.zip", ""), Some("zip"));
        assert_eq!(file_type("安装包.apk", ""), Some("apk"));
        assert_eq!(file_type("资料.odt", ""), Some("odt"));
        assert_eq!(file_type("模型.glb", ""), Some("glb"));
        assert_eq!(
            strategy("说明.rtf", ""),
            Some(AttachmentPreviewStrategy::Document)
        );
        assert_eq!(
            strategy("压缩包.zip", ""),
            Some(AttachmentPreviewStrategy::Document)
        );
        assert_eq!(
            strategy("安装包.apk", ""),
            Some(AttachmentPreviewStrategy::Document)
        );
        assert_eq!(strategy("photo.png", "image/png"), None);
        assert_eq!(strategy("clip.mp4", "video/mp4"), None);
        assert_eq!(file_type("photo.png", "image/png"), Some("png"));
        assert_eq!(file_type("clip.mp4", "video/mp4"), Some("mp4"));
        assert_eq!(file_type("unknown.bin", "application/octet-stream"), None);
    }
}
