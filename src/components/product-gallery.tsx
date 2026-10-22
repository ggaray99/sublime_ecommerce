"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductImage } from "@/data/products";

export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div className="gallery">
      <div className="gallery__main">
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          width={800}
          height={800}
          sizes="(max-width: 899px) 100vw, 50vw"
          preload={active === 0}
        />
        <span className="badge badge--coal gallery__tag">Imagen ilustrativa</span>
      </div>
      {images.length > 1 && (
        <ul className="gallery__thumbs" aria-label={`Imágenes de ${name}`}>
          {images.map((image, index) => (
            <li key={image.src}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={index === active}
                aria-label={`Ver imagen ${index + 1} de ${images.length}: ${image.alt}`}
              >
                <Image src={image.src} alt="" width={160} height={160} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
