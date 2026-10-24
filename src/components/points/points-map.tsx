"use client";

import { useState } from "react";
import { mapQuery, POINT_KINDS, type PointOfSale } from "@/lib/points";

const ALL = "";

/**
 * Keyless Google Maps embed: it shows the selected point (one pin at a time).
 * Showing every pin at once needs the Maps JavaScript API and an API key.
 */
const embedUrl = (point: PointOfSale) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery(point))}&z=${point.latitude !== null ? 16 : 15}&hl=es&output=embed`;
const directionsUrl = (point: PointOfSale) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery(point))}`;
const searchUrl = (point: PointOfSale) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(point))}`;

export function PointsMap({ points }: { points: PointOfSale[] }) {
  const cities = [...new Set(points.map((point) => point.city))];
  const [city, setCity] = useState(ALL);
  const visible = city === ALL ? points : points.filter((point) => point.city === city);
  const [selectedId, setSelectedId] = useState(points[0]?.id);
  const selected = visible.find((point) => point.id === selectedId) ?? visible[0];

  return (
    <div className="points">
      {cities.length > 1 && (
        <div className="category-chips" role="group" aria-label="Filtrar por localidad">
          <button type="button" aria-pressed={city === ALL} onClick={() => setCity(ALL)}>
            Todas ({points.length})
          </button>
          {cities.map((name) => (
            <button key={name} type="button" aria-pressed={city === name} onClick={() => setCity(name)}>
              {name} ({points.filter((point) => point.city === name).length})
            </button>
          ))}
        </div>
      )}

      <div className="points__layout">
        <ul className="points__list" aria-label="Puntos de venta">
          {visible.map((point) => {
            const active = point.id === selected?.id;
            return (
              <li key={point.id}>
                <article className={active ? "point-card is-selected" : "point-card"}>
                  <p className="point-card__kind">{POINT_KINDS[point.kind]}</p>
                  <h2 className="point-card__name">{point.name}</h2>
                  <p>
                    {point.address}, {point.city}
                    <span className="muted"> · {point.province}</span>
                  </p>
                  {point.hours && <p className="muted">{point.hours}</p>}
                  {point.notes && <p className="point-card__notes">{point.notes}</p>}
                  {(point.phone || point.instagram) && (
                    <p className="point-card__contact">
                      {point.phone && <span>Tel.: {point.phone}</span>}
                      {point.instagram && (
                        <a href={`https://www.instagram.com/${point.instagram}/`} target="_blank" rel="noopener noreferrer">
                          @{point.instagram}
                        </a>
                      )}
                    </p>
                  )}
                  <div className="point-card__actions">
                    <button type="button" className="btn btn--acid" aria-pressed={active} onClick={() => setSelectedId(point.id)}>
                      {active ? "En el mapa" : "Ver en el mapa"}
                      <span className="visually-hidden">: {point.name}</span>
                    </button>
                    <a className="btn btn--ghost" href={directionsUrl(point)} target="_blank" rel="noopener noreferrer">
                      Cómo llegar<span className="visually-hidden"> a {point.name} (se abre Google Maps)</span>
                    </a>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>

        {selected && (
          <div className="points__map">
            <iframe
              key={selected.id}
              title={`Mapa: ${selected.name}, ${selected.address}, ${selected.city}`}
              src={embedUrl(selected)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <p className="points__map-caption">
              <strong>{selected.name}</strong> · {selected.address}, {selected.city}{" "}
              <a href={searchUrl(selected)} target="_blank" rel="noopener noreferrer">
                Abrir en Google Maps
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
