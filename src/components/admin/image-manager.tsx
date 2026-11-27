import Image from "next/image";
import { Badge } from "@/components/admin/ui";
import { MAX_IMAGES_PER_PRODUCT, type AdminImage } from "@/server/admin/images-repository";
import type { AdminProduct } from "@/server/admin/repository";
import { ImageAltForm, ImageTools, ImageUploadForm } from "./products/product-image-tools";
import styles from "./products/product-page.module.css";

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/** Product photos: position 1 is the cover used on cards and listings. */
export function ImageManager({ product, images, uploadsEnabled }: { product: AdminProduct; images: AdminImage[]; uploadsEnabled: boolean }) {
  return (
    <>
      {images.length ? (
        <ol className={styles.images} aria-label="Imágenes en orden: la primera es la portada">
          {images.map((image, index) => (
            <li key={image.id} className={styles.image}>
              <div className={styles.thumbWrap}>
                <Image src={image.url} alt="" width={240} height={240} className={styles.thumb} />
                {index === 0 && (
                  <span className={styles.cover} aria-hidden="true">
                    <Badge tone="info">Portada</Badge>
                  </span>
                )}
              </div>
              <p className={styles.imageMeta}>
                {index === 0 ? "Portada" : `Imagen ${index + 1}`}
                {" · "}
                {image.uploaded ? `${image.width}×${image.height} px · ${kb(image.sizeBytes ?? 0)}` : "Imagen original del catálogo"}
              </p>
              <ImageAltForm productId={product.id} imageId={image.id} alt={image.alt} position={index + 1} />
              <ImageTools productId={product.id} imageId={image.id} position={index + 1} isFirst={index === 0} isLast={index === images.length - 1} />
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.muted}>Sin imágenes: la tienda muestra la imagen de la categoría.</p>
      )}

      <div className={styles.block}>
        <h3 className={styles.subtitle}>Agregar imagen</h3>
        {!uploadsEnabled ? (
          <p className={styles.muted}>La carga de imágenes no está configurada en este entorno (falta configurar el almacenamiento de archivos).</p>
        ) : images.length >= MAX_IMAGES_PER_PRODUCT ? (
          <p className={styles.muted}>Llegaste al máximo de {MAX_IMAGES_PER_PRODUCT} imágenes. Quitá alguna para subir otra.</p>
        ) : (
          <ImageUploadForm productId={product.id} productName={product.name} />
        )}
      </div>
    </>
  );
}
