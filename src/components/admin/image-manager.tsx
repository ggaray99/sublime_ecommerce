import Image from "next/image";
import { moveImageAction, removeImageAction } from "@/app/admin/actions";
import { MAX_IMAGES_PER_PRODUCT, type AdminImage } from "@/server/admin/images-repository";
import type { AdminProduct } from "@/server/admin/repository";
import { ConfirmButton } from "./confirm-button";
import { ImageAltForm, ProductImageUpload } from "./media-forms";

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/** Product photos: position 1 is the cover used on cards and listings. */
export function ImageManager({ product, images, uploadsEnabled }: { product: AdminProduct; images: AdminImage[]; uploadsEnabled: boolean }) {
  return (
    <>
      {images.length ? (
        <ol className="image-admin-list">
          {images.map((image, index) => (
            <li key={image.id} className="image-admin">
              <Image src={image.url} alt="" width={160} height={160} className="image-admin__thumb" />
              <div className="image-admin__body">
                <p>
                  <strong>{index === 0 ? "Portada" : `Imagen ${index + 1}`}</strong>
                  <span className="muted">
                    {" · "}
                    {image.uploaded
                      ? `${image.width}×${image.height} px · ${kb(image.sizeBytes ?? 0)}`
                      : "Imagen original del catálogo"}
                  </span>
                </p>
                <ImageAltForm productId={product.id} imageId={image.id} alt={image.alt} />
                <div className="image-admin__actions">
                  {index > 0 && (
                    <form action={moveImageAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <button type="submit" name="move" value="first" className="link-button">
                        Usar como portada
                      </button>
                      <button type="submit" name="move" value="up" className="link-button">
                        Subir<span className="visually-hidden"> imagen {index + 1}</span>
                      </button>
                    </form>
                  )}
                  {index < images.length - 1 && (
                    <form action={moveImageAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <button type="submit" name="move" value="down" className="link-button">
                        Bajar<span className="visually-hidden"> imagen {index + 1}</span>
                      </button>
                    </form>
                  )}
                  <form action={removeImageAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <ConfirmButton message="¿Quitar esta imagen? Si se subió desde el panel, el archivo se elimina.">
                      Quitar<span className="visually-hidden"> imagen {index + 1}</span>
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Sin imágenes: la tienda muestra la imagen de la categoría.</p>
      )}

      <h3 className="account__subtitle">Agregar imagen</h3>
      {!uploadsEnabled ? (
        <p className="panel panel--muted">La carga de imágenes no está configurada en este entorno (falta configurar el almacenamiento de archivos).</p>
      ) : images.length >= MAX_IMAGES_PER_PRODUCT ? (
        <p className="muted">Llegaste al máximo de {MAX_IMAGES_PER_PRODUCT} imágenes. Quitá alguna para subir otra.</p>
      ) : (
        <ProductImageUpload productId={product.id} productName={product.name} />
      )}
    </>
  );
}
