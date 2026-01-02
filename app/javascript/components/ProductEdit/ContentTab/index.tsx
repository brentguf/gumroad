import { Node as TiptapNode } from "@tiptap/core";
import { parseISO } from "date-fns";
import * as React from "react";
import { cast } from "ts-safe-cast";

import { type Post } from "$app/types/workflow";
import { formatDate } from "$app/utils/date";
import { request, ResponseError } from "$app/utils/request";

import { Button } from "$app/components/Button";
import { ComboBox } from "$app/components/ComboBox";
import { EvaporateUploaderProvider } from "$app/components/EvaporateUploader";
import { Icon } from "$app/components/Icons";
import { Modal } from "$app/components/Modal";
import { FileEmbedGroup } from "$app/components/ProductEdit/ContentTab/FileEmbedGroup";
import { Layout } from "$app/components/ProductEdit/Layout";
import { useProductEditContext, Variant } from "$app/components/ProductEdit/state";
import { S3UploadConfigProvider } from "$app/components/S3UploadConfig";
import { FileUpload } from "$app/components/TiptapExtensions/FileUpload";
import { LicenseKey, LicenseProvider } from "$app/components/TiptapExtensions/LicenseKey";
import { LongAnswer } from "$app/components/TiptapExtensions/LongAnswer";
import { ExternalMediaFileEmbed } from "$app/components/TiptapExtensions/MediaEmbed";
import { MoreLikeThis } from "$app/components/TiptapExtensions/MoreLikeThis";
import { MoveNode } from "$app/components/TiptapExtensions/MoveNode";
import { Posts, PostsProvider } from "$app/components/TiptapExtensions/Posts";
import { ShortAnswer } from "$app/components/TiptapExtensions/ShortAnswer";
import { UpsellCard } from "$app/components/TiptapExtensions/UpsellCard";
import { useConfigureEvaporate } from "$app/components/useConfigureEvaporate";

import { ContentTabContent } from "./ContentTabContent";
import { FileEmbed } from "./FileEmbed";
import { titleWithFallback } from "./PageTab";

declare global {
  interface Window {
    ___dropbox_files_picked: DropboxFile[] | null;
  }
}

export const extensions = (productId: string, extraExtensions: TiptapNode[] = []) => [
  ...extraExtensions,
  ...[
    FileEmbed,
    FileEmbedGroup,
    ExternalMediaFileEmbed,
    Posts,
    LicenseKey,
    ShortAnswer,
    LongAnswer,
    FileUpload,
    MoveNode,
    UpsellCard,
    MoreLikeThis.configure({ productId }),
  ].filter((ext) => !extraExtensions.some((existing) => existing.name === ext.name)),
];

//TODO inline this once all the crazy providers are gone
export const ContentTab = () => {
  const { id, awsKey, s3Url, seller, product, updateProduct, uniquePermalink } = useProductEditContext();
  const [selectedVariantId, setSelectedVariantId] = React.useState(product.variants[0]?.id ?? null);
  const [confirmingDiscardVariantContent, setConfirmingDiscardVariantContent] = React.useState(false);
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId);

  const setHasSameRichContent = (value: boolean) => {
    if (value) {
      updateProduct((product) => {
        product.has_same_rich_content_for_all_variants = true;
        if (!product.rich_content.length) product.rich_content = selectedVariant?.rich_content ?? [];
        for (const variant of product.variants) variant.rich_content = [];
      });
    } else {
      updateProduct((product) => {
        product.has_same_rich_content_for_all_variants = false;
        if (product.rich_content.length > 0) {
          for (const variant of product.variants) variant.rich_content = product.rich_content;
          product.rich_content = [];
        }
      });
    }
  };

  const { evaporateUploader, s3UploadConfig } = useConfigureEvaporate({
    aws_access_key_id: awsKey,
    s3_url: s3Url,
    user_id: seller.id,
  });

  const loadedPostsData = React.useRef(
    new Map<string | null, { posts: Post[]; total: number; next_page: number | null }>(),
  );
  const [loadingPostsCount, setLoadingPostsCount] = React.useState(0);
  const postsDataForEditingId = loadedPostsData.current.get(selectedVariantId);
  const fetchMorePosts = async (refresh?: boolean) => {
    const page = refresh ? 1 : postsDataForEditingId?.next_page;
    if (page === null) return;
    setLoadingPostsCount((count) => ++count);
    try {
      const response = await request({
        method: "GET",
        url: Routes.internal_product_product_posts_path(uniquePermalink, {
          params: { page: page ?? 1, variant_id: selectedVariantId },
        }),
        accept: "json",
      });
      if (!response.ok) throw new ResponseError();
      const parsedResponse = cast<{ posts: Post[]; total: number; next_page: number | null }>(await response.json());
      loadedPostsData.current.set(
        selectedVariantId,
        refresh
          ? parsedResponse
          : {
              posts: [...(postsDataForEditingId?.posts ?? []), ...parsedResponse.posts],
              total: parsedResponse.total,
              next_page: parsedResponse.next_page,
            },
      );
    } finally {
      setLoadingPostsCount((count) => --count);
    }
  };
  const postsContext = {
    posts: postsDataForEditingId?.posts || null,
    total: postsDataForEditingId?.total || 0,
    isLoading: loadingPostsCount > 0,
    hasMorePosts: postsDataForEditingId?.next_page !== null,
    fetchMorePosts,
    productPermalink: uniquePermalink,
  };

  const licenseInfo = {
    licenseKey: "6F0E4C97-B72A4E69-A11BF6C4-AF6517E7",
    isMultiSeatLicense: product.native_type === "membership" ? product.is_multiseat_license : null,
    seats: product.is_multiseat_license ? 5 : null,
    onIsMultiSeatLicenseChange: (value: boolean) => updateProduct({ is_multiseat_license: value }),
    productId: id,
  };

  return (
    <PostsProvider value={postsContext}>
      <LicenseProvider value={licenseInfo}>
        <EvaporateUploaderProvider value={evaporateUploader}>
          <S3UploadConfigProvider value={s3UploadConfig}>
            <Layout
              headerActions={
                product.variants.length > 0 ? (
                  <>
                    <hr className="relative left-1/2 my-2 w-screen max-w-none -translate-x-1/2 border-border lg:hidden" />
                    <ComboBox<Variant>
                      // TODO: Currently needed to get the icon on the selected option even though this is not multiple select. We should fix this in the design system
                      multiple
                      input={(props) => (
                        <div {...props} className="input h-full min-h-auto" aria-label="Select a version">
                          <span className="fake-input text-singleline">
                            {selectedVariant && !product.has_same_rich_content_for_all_variants
                              ? `Editing: ${selectedVariant.name || "Untitled"}`
                              : "Editing: All versions"}
                          </span>
                          <Icon name="outline-cheveron-down" />
                        </div>
                      )}
                      options={product.variants}
                      option={(item, props, index) => (
                        <>
                          <div
                            {...props}
                            onClick={(e) => {
                              props.onClick?.(e);
                              setSelectedVariantId(item.id);
                            }}
                            aria-selected={item.id === selectedVariantId}
                            inert={product.has_same_rich_content_for_all_variants}
                          >
                            <div>
                              <h4>{item.name || "Untitled"}</h4>
                              {item.id === selectedVariant?.id ? (
                                <small>Editing</small>
                              ) : product.has_same_rich_content_for_all_variants || item.rich_content.length ? (
                                <small>
                                  Last edited on{" "}
                                  {formatDate(
                                    (product.has_same_rich_content_for_all_variants
                                      ? product.rich_content
                                      : item.rich_content
                                    ).reduce<Date | null>((acc, item) => {
                                      const date = parseISO(item.updated_at);
                                      return acc && acc > date ? acc : date;
                                    }, null) ?? new Date(),
                                  )}
                                </small>
                              ) : (
                                <small className="text-muted">No content yet</small>
                              )}
                            </div>
                          </div>
                          {index === product.variants.length - 1 ? (
                            <div className="option">
                              <label style={{ alignItems: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={product.has_same_rich_content_for_all_variants}
                                  onChange={() => {
                                    if (!product.has_same_rich_content_for_all_variants && product.variants.length > 1)
                                      return setConfirmingDiscardVariantContent(true);
                                    setHasSameRichContent(!product.has_same_rich_content_for_all_variants);
                                  }}
                                />
                                <small>Use the same content for all versions</small>
                              </label>
                            </div>
                          ) : null}
                        </>
                      )}
                    />
                  </>
                ) : null
              }
            >
              <ContentTabContent selectedVariantId={selectedVariantId} />
            </Layout>
            <Modal
              open={confirmingDiscardVariantContent}
              onClose={() => setConfirmingDiscardVariantContent(false)}
              title="Discard content from other versions?"
              footer={
                <>
                  <Button onClick={() => setConfirmingDiscardVariantContent(false)}>No, cancel</Button>
                  <Button
                    color="danger"
                    onClick={() => {
                      setHasSameRichContent(true);
                      setConfirmingDiscardVariantContent(false);
                    }}
                  >
                    Yes, proceed
                  </Button>
                </>
              }
            >
              If you proceed, the content from all other versions of this product will be removed and replaced with the
              content of "{titleWithFallback(selectedVariant?.name)}".
              <strong>This action is irreversible.</strong>
            </Modal>
          </S3UploadConfigProvider>
        </EvaporateUploaderProvider>
      </LicenseProvider>
    </PostsProvider>
  );
};
