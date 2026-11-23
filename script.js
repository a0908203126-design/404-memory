(() => {
  const input = document.getElementById("photoInput");
  const button = document.getElementById("cameraButton");
  const wall = document.getElementById("photoWall");
  const empty = document.getElementById("emptyState");
  const toast = document.getElementById("toast");
  const DB_NAME = "404-memory-archive";
  const STORE = "memories";
  let db;
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("這個瀏覽器不支援本機照片保存。"));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  function transaction(mode = "readonly") {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function getAllMemories() {
    return new Promise((resolve, reject) => {
      const request = transaction().getAll();

      request.onsuccess = () => {
        resolve(request.result.sort((a, b) => a.createdAt - b.createdAt));
      };

      request.onerror = () => reject(request.error);
    });
  }

  function saveMemory(memory) {
    return new Promise((resolve, reject) => {
      const request = transaction("readwrite").put(memory);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  function deleteMemory(id) {
    return new Promise((resolve, reject) => {
      const request = transaction("readwrite").delete(id);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  // 將照片左右翻轉，讓照片中的文字正常閱讀
  async function flipImageHorizontally(file) {
    const imageUrl = URL.createObjectURL(file);

    try {
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");

      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);

      return await new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) {
            resolve(new File([blob], "photo.jpg", {
              type: "image/jpeg"
            }));
          } else {
            reject(new Error("照片處理失敗"));
          }
        }, "image/jpeg", 0.95);
      });

    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function updateEmptyState() {
    empty.hidden = wall.children.length > 0;
  }

  function makeCard(memory) {
    const card = document.createElement("article");
    card.className = "photo-card";

    const image = document.createElement("img");
    image.className = "photo-image";
    image.alt = "觀眾留下的拍立得照片";

    const objectUrl = URL.createObjectURL(memory.image);
    image.src = objectUrl;

    image.addEventListener("load", () => {
      URL.revokeObjectURL(objectUrl);
    }, { once: true });

    const caption = document.createElement("textarea");
    caption.className = "caption";
    caption.rows = 2;
    caption.maxLength = 90;
    caption.placeholder = "在這張照片下面，留一句話……";
    caption.setAttribute("aria-label", "編輯這張照片的一句話");
    caption.value = memory.caption || "";

    let saveTimer;

    caption.addEventListener("input", () => {
      clearTimeout(saveTimer);

      saveTimer = setTimeout(async () => {
        memory.caption = caption.value;

        try {
          await saveMemory(memory);
        } catch {
          showToast("文字暫時無法保存，請稍後再試。");
        }
      }, 250);
    });

    caption.addEventListener("blur", async () => {
      clearTimeout(saveTimer);
      memory.caption = caption.value;

      try {
        await saveMemory(memory);
      } catch {}
    });

    const date = document.createElement("span");
    date.className = "photo-date";
    date.textContent = new Date(memory.createdAt).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-photo";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "刪除這張照片");

    remove.addEventListener("click", async () => {
      if (!window.confirm("確定要刪除這張照片嗎？")) return;

      try {
        await deleteMemory(memory.id);
        card.remove();
        updateEmptyState();
        showToast("照片已從這台裝置移除。");
      } catch {
        showToast("刪除失敗，請再試一次。");
      }
    });

    card.append(image, caption, date, remove);

    return card;
  }

  async function renderAll() {
    const memories = await getAllMemories();

    wall.replaceChildren();

    memories.forEach(memory => {
      wall.appendChild(makeCard(memory));
    });

    updateEmptyState();
  }

  button.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("請選擇圖片檔案。");
      input.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast("照片檔案請小於 15 MB。");
      input.value = "";
      return;
    }

    try {
      // 先將照片左右翻轉
      const correctedImage = await flipImageHorizontally(file);

      const memory = {
        id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
        image: correctedImage,
        caption: "",
        createdAt: Date.now()
      };

      await saveMemory(memory);

      wall.appendChild(makeCard(memory));
      updateEmptyState();

      showToast("照片已留下，寫下一句話吧。");

    } catch (error) {
      showToast("照片保存失敗，請確認瀏覽器儲存空間。");

    } finally {
      input.value = "";
    }
  });

  openDatabase()
    .then(renderAll)
    .catch(() => {
      showToast("無法啟用本機保存功能，請改用最新版 Safari 或 Chrome。");
    });

})();
