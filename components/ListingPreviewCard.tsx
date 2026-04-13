"use client";

export type ListingPreviewData = {
  productName: string;
  title: string;
  description: string;
  tags: string[];
  price: string;
  productContents: string[];
  mockupPrompt: string;
  fileDeliveryDescription: string;
};

type ListingPreviewCardProps = {
  preview: ListingPreviewData;
};

export function ListingPreviewCard({ preview }: ListingPreviewCardProps) {
  const descriptionParagraphs = preview.description
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <article className="listing-preview-card">
      <div className="listing-preview-header">
        <div>
          <span className="field-label">Product Name</span>
          <h3 className="listing-preview-name">{preview.productName}</h3>
        </div>
        <div className="listing-price-badge">{preview.price}</div>
      </div>

      <section className="listing-preview-section">
        <span className="field-label">Title</span>
        <p className="listing-preview-title">{preview.title}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Tags</span>
        <div className="listing-tag-grid">
          {preview.tags.map((tag) => (
            <span key={tag} className="listing-tag-chip">
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Description</span>
        <div className="listing-description">
          {descriptionParagraphs.map((paragraph) => (
            <p key={paragraph} className="detail-body">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Product Contents</span>
        <ul className="listing-bullet-list">
          {preview.productContents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">File Delivery</span>
        <p className="detail-body">{preview.fileDeliveryDescription}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Mockup Prompt</span>
        <p className="detail-body">{preview.mockupPrompt}</p>
      </section>
    </article>
  );
}
