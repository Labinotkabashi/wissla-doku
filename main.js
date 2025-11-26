// Alle Einträge werden nur lokal im Browser gespeichert
const STORAGE_KEY = "wissla_doku_entries_v1";

// ---------- Speicher-Funktionen ----------

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Fehler beim Laden:", e);
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ---------- Liste rendern ----------

function renderList() {
  const container = document.getElementById("photoList");
  const entries = loadEntries();

  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = "<p class='small'>Noch keine Einträge vorhanden.</p>";
    return;
  }

  entries
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .forEach((entry) => {
      const div = document.createElement("div");
      div.className = "photo-item";
      div.innerHTML = `
        <img src="${entry.dataUrl}" alt="Foto">
        <div class="photo-info">
          <div>
            <span class="badge">${new Date(entry.timestamp).toLocaleString("de-DE")}</span>
            ${entry.address ? `<span class="badge">${entry.address}</span>` : ""}
          </div>
          ${
            entry.comment
              ? `<p>${entry.comment}</p>`
              : "<p class='small'><i>Kein Kommentar</i></p>"
          }
          <p class="small">
            GPS im Bild:
            ${
              entry.lat != null && entry.lng != null
                ? entry.lat.toFixed(6) + ", " + entry.lng.toFixed(6)
                : "nicht verfügbar"
            }
          </p>
          <button class="danger" type="button" onclick="deleteEntry('${entry.id}')">
            Löschen
          </button>
        </div>
      `;
      container.appendChild(div);
    });
}

// Eintrag löschen (wird aus HTML aufgerufen)
function deleteEntry(id) {
  const entries = loadEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  renderList();
}
window.deleteEntry = deleteEntry;

// ---------- GPS & Adresse ----------

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.warn("Geolocation Fehler:", err);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=json&lat=" +
      lat +
      "&lon=" +
      lng +
      "&zoom=18&addressdetails=1";

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) return "";
    const data = await res.json();

    if (data && data.address) {
      const a = data.address;
      const parts = [];
      if (a.road) {
        let street = a.road;
        if (a.house_number) street += " " + a.house_number;
        parts.push(street);
      }
      if (a.postcode) parts.push(a.postcode);
      if (a.city) parts.push(a.city);
      else if (a.town) parts.push(a.town);
      else if (a.village) parts.push(a.village);
      return parts.join(", ");
    }
    return data.display_name || "";
  } catch (e) {
    console.warn("Reverse-Geocoding Fehler:", e);
    return "";
  }
}

// ---------- Text ins Bild rendern ----------

function drawOverlayedImage(imageDataUrl, textLines) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 1280;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;

      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const fontSize = 18;
      ctx.font = fontSize + "px sans-serif";
      ctx.textBaseline = "bottom";

      const lineHeight = fontSize + 4;
      const padding = 8;

      let maxTextWidth = 0;
      textLines.forEach((line) => {
        const w = ctx.measureText(line).width;
        if (w > maxTextWidth) maxTextWidth = w;
      });

      const boxWidth = maxTextWidth + padding * 2;
      const boxHeight = lineHeight * textLines.length + padding * 2;
      const x = 10;
      const y = canvas.height - 10;

      // halbtransparente Box
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(x, y - boxHeight, boxWidth, boxHeight);

      // Text
      ctx.fillStyle = "#ffffff";
      textLines.forEach((line, index) => {
        const tx = x + padding;
        const ty = y - boxHeight + padding + lineHeight * (index + 1) - 4;
        ctx.fillText(line, tx, ty);
      });

      const resultDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      resolve(resultDataUrl);
    };
    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}

// ---------- Hauptlogik ----------

document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status");
  const fileInput = document.getElementById("photoInput");
  const commentInput = document.getElementById("comment");
  const saveBtn = document.getElementById("saveBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");

  // Speichern
  saveBtn.addEventListener("click", async () => {
    status.textContent = "";

    const file = fileInput.files[0];
    if (!file) {
      status.textContent = "Bitte zuerst ein Foto auswählen/aufnehmen.";
      return;
    }

    status.textContent = "Foto wird verarbeitet, bitte warten...";

    const reader = new FileReader();
    reader.onload = async (e) => {
      let dataUrl = e.target.result;
      const timestamp = new Date();
      const tsString = timestamp.toLocaleString("de-DE");

      const loc = await getLocation();
      let lat = null;
      let lng = null;
      let address = "";

      if (loc) {
        lat = loc.lat;
        lng = loc.lng;
        address = await reverseGeocode(lat, lng);
      }

      const coordText =
        lat != null && lng != null
          ? lat.toFixed(6) + ", " + lng.toFixed(6)
          : "keine Koordinaten";

      const lines = [tsString, coordText, address || ""].filter(Boolean);

      // Text ins Bild schreiben
      dataUrl = await drawOverlayedImage(dataUrl, lines);

      const entry = {
        id: Date.now().toString(),
        dataUrl,
        comment: commentInput.value.trim(),
        timestamp: timestamp.toISOString(),
        lat,
        lng,
        address,
      };

      const entries = loadEntries();
      entries.push(entry);
      saveEntries(entries);

      status.textContent =
        "Foto gespeichert. Bild unten lange gedrückt halten → 'Zu Fotos hinzufügen', um es in die Fotos-App zu speichern.";
      fileInput.value = "";
      commentInput.value = "";
      renderList();
    };
    reader.readAsDataURL(file);
  });

  // Liste aktualisieren
  refreshBtn.addEventListener("click", renderList);

  // Alle Einträge löschen
  clearAllBtn.addEventListener("click", () => {
    if (confirm("Wirklich alle Einträge löschen?")) {
      localStorage.removeItem(STORAGE_KEY);
      renderList();
    }
  });

  // Beim Start Liste laden
  renderList();
});
