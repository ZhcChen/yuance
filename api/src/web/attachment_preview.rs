#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachmentPreviewStrategy {
    Pdf,
    Text,
    Spreadsheet,
    Docx,
    Pptx,
    LegacyDoc,
    LegacyPpt,
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
        }
    }

    pub fn kind_label(self) -> &'static str {
        match self {
            Self::Pdf => "PDF",
            Self::Text => "文本",
            Self::Spreadsheet => "表格",
            Self::Docx | Self::LegacyDoc => "Word",
            Self::Pptx | Self::LegacyPpt => "演示",
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
        _ => None,
    }
}

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

pub fn file_type(filename: &str, content_type: &str) -> Option<&'static str> {
    match normalized_extension(filename).as_deref() {
        Some("doc") => Some("doc"),
        Some("docx") => Some("docx"),
        Some("txt") => Some("txt"),
        Some("log") => Some("log"),
        Some("md") => Some("md"),
        Some("json") => Some("json"),
        Some("xml") => Some("xml"),
        Some("yaml") => Some("yaml"),
        Some("yml") => Some("yml"),
        Some("xls") => Some("xls"),
        Some("xlsx") => Some("xlsx"),
        Some("csv") => Some("csv"),
        Some("ods") => Some("ods"),
        Some("ppt") => Some("ppt"),
        Some("pptx") => Some("pptx"),
        Some("pdf") => Some("pdf"),
        _ => file_type_from_content_type(content_type),
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
        assert_eq!(
            kind("payload.svg", "application/octet-stream", false),
            Some("image")
        );
    }
}
