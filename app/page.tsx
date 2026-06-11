"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Download, 
  RotateCw, 
  SlidersHorizontal, 
  Trash2, 
  Plus, 
  RotateCcw, 
  X, 
  Loader2, 
  HelpCircle, 
  Scissors, 
  Check, 
  Info,
  Maximize2,
  Copy,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Grid,
  Cloud,
  Edit
} from "lucide-react";

interface Detection {
  id: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] - values 0 to 1000
  label: string;
  rotation: number; // 0, 90, 180, 270
  brightness: number; // 0 to 200 (100 is normal)
  contrast: number; // 0 to 200 (100 is normal)
  grayscale: boolean;
  sepia: boolean;
  suggested_filename?: string;
  customized?: boolean;
}

interface CroppedPhoto {
  id: string;
  label: string;
  croppedSrc: string; // generated high-res base64 src
  detection: Detection;
}

// Module-level identifier generator to satisfy compiler purity checks
const generateUniqueId = (prefix: string): string => {
  if (typeof window !== "undefined") {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
  return `${prefix}-ssr`;
};

export default function AIPhotoSheetCutter() {
  // Image states
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [croppedPhotos, setCroppedPhotos] = useState<CroppedPhoto[]>([]);
  const [sheetDimensions, setSheetDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  
  // DRAG/RESIZE variables
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    handle: "tl" | "tr" | "bl" | "br" | "move";
    startX: number;
    startY: number;
    startBox: [number, number, number, number];
  } | null>(null);

  // Selected crop for active editing
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<string | null>(null);

  // Workspace zoom and pan controls
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [gridType, setGridType] = useState<"none" | "thirds" | "fine">("none");

  // Grid slicing state variables
  const [showGridSlicer, setShowGridSlicer] = useState<boolean>(false);
  const [expandedExtremities, setExpandedExtremities] = useState<boolean>(false);
  const [gridRows, setGridRows] = useState<number>(3);
  const [gridCols, setGridCols] = useState<number>(2);
  const [gridWidthPercent, setGridWidthPercent] = useState<number>(90);
  const [gridHeightPercent, setGridHeightPercent] = useState<number>(90);
  const [gridMarginPercent, setGridMarginPercent] = useState<number>(5);

  // Individual extremities / bounds fine-tuning per row and column
  const [gridRowTops, setGridRowTops] = useState<number[]>([]);
  const [gridRowBottoms, setGridRowBottoms] = useState<number[]>([]);
  const [gridColLefts, setGridColLefts] = useState<number[]>([]);
  const [gridColRights, setGridColRights] = useState<number[]>([]);

  // Cell-by-cell level fine-tuning margin overrides
  const [gridCellTops, setGridCellTops] = useState<Record<string, number>>({});
  const [gridCellBottoms, setGridCellBottoms] = useState<Record<string, number>>({});
  const [gridCellLefts, setGridCellLefts] = useState<Record<string, number>>({});
  const [gridCellRights, setGridCellRights] = useState<Record<string, number>>({});
  const [selectedGridCell, setSelectedGridCell] = useState<{ row: number; col: number } | null>(null);

  // Cloudinary storage configuration & state
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cloudinary_cloud_name") || "";
    }
    return "";
  });
  const [cloudinaryUploadPreset, setCloudinaryUploadPreset] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cloudinary_upload_preset") || "";
    }
    return "";
  });
  const [cloudinaryFolder, setCloudinaryFolder] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cloudinary_folder") || "photo_cutter_crops";
    }
    return "photo_cutter_crops";
  });
  const [isUploadingToCloudinary, setIsUploadingToCloudinary] = useState<boolean>(false);
  const [cloudinaryProgress, setCloudinaryProgress] = useState<string | null>(null);
  const [cloudinaryError, setCloudinaryError] = useState<string | null>(null);
  const [cloudinaryUploadedUrls, setCloudinaryUploadedUrls] = useState<{ id: string; label: string; url: string; secureUrl: string; bytes: number; format: string; width: number; height: number }[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("cloudinary_uploaded_history");
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        console.error("Erreur lecture historique Cloudinary:", e);
      }
    }
    return [];
  });

  // Grid manual interactive offsets
  const [gridRowOffsets, setGridRowOffsets] = useState<number[]>([]);
  const [gridColOffsets, setGridColOffsets] = useState<number[]>([]);
  const [activeGridDrag, setActiveGridDrag] = useState<{
    type: "row" | "col";
    index: number;
    startPos: number;
    startOffset: number;
  } | null>(null);

  // Google Picker and Drive upload/CRUD integration states
  const [googleConfigModal, setGoogleConfigModal] = useState<boolean>(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);
  const [googleDriveFolders, setGoogleDriveFolders] = useState<{ id: string; name: string }[]>([]);
  const [googleDriveSelectedFolder, setGoogleDriveSelectedFolder] = useState<string>("root");
  const [googleDriveNewFolderName, setGoogleDriveNewFolderName] = useState<string>("");
  const [googleDriveRenameInput, setGoogleDriveRenameInput] = useState<string>("");
  const [isRenamingFolderId, setIsRenamingFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState<string | null>(null);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<boolean>(false);
  const [googleDriveShowNewFolderInput, setGoogleDriveShowNewFolderInput] = useState<boolean>(false);

  // Refs for tracking DOM elements and resolutions
  const containerRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const originalMeta = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Reset the workspace
  const handleReset = () => {
    setImageSrc(null);
    setDetections([]);
    setCroppedPhotos([]);
    setError(null);
    setSelectedCropId(null);
    setActiveFilterTab(null);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
    setGridType("none");
    setShowGridSlicer(false);
    setGridRows(3);
    setGridCols(2);
    setGridWidthPercent(90);
    setGridHeightPercent(95);
    setGridMarginPercent(5);
    setGridRowOffsets([]);
    setGridColOffsets([]);
    setGridRowTops([]);
    setGridRowBottoms([]);
    setGridColLefts([]);
    setGridColRights([]);
    setGridCellTops({});
    setGridCellBottoms({});
    setGridCellLefts({});
    setGridCellRights({});
    setSelectedGridCell(null);
    setActiveGridDrag(null);
    originalMeta.current = { width: 0, height: 0 };
    setSheetDimensions({ width: 0, height: 0 });
  };

  // Generate Procedural Demo Collages (CORS-safe, offline-ready, instantly testable)
  const handleLoadDemo = useCallback(async (theme: "retro" | "travel") => {
    setLoading(true);
    setLoadingStep("Génération procédurale de la planche de test...");
    
    // Allow React state to update before blocking canvas work
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossible de créer le contexte canvas");

      // 1. Draw elegant clipboard/album background
      if (theme === "retro") {
        // Wooden retro styled background
        const grad = ctx.createLinearGradient(0, 0, 1200, 800);
        grad.addColorStop(0, "#ededeb");
        grad.addColorStop(1, "#d5d5cd");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1200, 800);
        
        // Cork / paper texture dots
        ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
        for (let i = 0; i < 2000; i++) {
          const rx = Math.random() * 1200;
          const ry = Math.random() * 800;
          ctx.fillRect(rx, ry, 1.5, 1.5);
        }
      } else {
        // Modern workbench light beige layout
        const grad = ctx.createLinearGradient(0, 0, 1200, 800);
        grad.addColorStop(0, "#fbfbf9");
        grad.addColorStop(1, "#e8e8e3");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1200, 800);
      }

      // Helper to draw a procedural beautiful photo with a polaroid border
      const drawProceduralPhoto = (
        title: string,
        x: number,
        y: number,
        w: number,
        h: number,
        tiltDeg: number,
        drawContent: (c: CanvasRenderingContext2D, pw: number, ph: number) => void
      ) => {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((tiltDeg * Math.PI) / 180);

        // Card shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 6;

        // White border card (Polaroid style)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-w / 2, -h / 2, w, h);
        
        ctx.shadowColor = "transparent"; // reset shadow for content
        
        // Inner photo size
        const border = theme === "retro" ? 20 : 12;
        const bottomBorder = theme === "retro" ? 60 : 12;
        const photoW = w - border * 2;
        const photoH = h - border - bottomBorder;
        const px = -w / 2 + border;
        const py = -h / 2 + border;

        ctx.save();
        // Clip to photo area
        ctx.beginPath();
        ctx.rect(px, py, photoW, photoH);
        ctx.clip();

        // Draw inner custom photograph art
        drawContent(ctx, photoW, photoH);
        
        ctx.restore();

        // If retro, add photo handwriting
        if (theme === "retro") {
          ctx.font = 'italic 18px "Caveat", "Courier New", cursive';
          ctx.fillStyle = "#333333";
          ctx.textAlign = "center";
          ctx.fillText(title, 0, h / 2 - 20);
        }

        ctx.restore();
      };

      if (theme === "retro") {
        // 1. Cozy Cabin Sunset
        drawProceduralPhoto("Chalet au coucher de soleil, 1984", 80, 80, 420, 310, -3, (c, pw, ph) => {
          // sky sky
          const skyLine = c.createLinearGradient(0, -ph/2, 0, ph/2);
          skyLine.addColorStop(0, "#ff7e5f");
          skyLine.addColorStop(0.5, "#feb47b");
          skyLine.addColorStop(1, "#3f2b96");
          c.fillStyle = skyLine;
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Golden sun
          c.fillStyle = "#fffc00";
          c.beginPath();
          c.arc(-pw/4, ph/5, 40, 0, Math.PI * 2);
          c.fill();

          // Mountains
          c.fillStyle = "#2c2c54";
          c.beginPath();
          c.moveTo(-pw/2, ph/2);
          c.lineTo(-pw/4, -ph/10);
          c.lineTo(0, ph/2);
          c.fill();

          c.fillStyle = "#1e1e30";
          c.beginPath();
          c.moveTo(-pw/8, ph/2);
          c.lineTo(pw/3, -ph/5);
          c.lineTo(pw/2, ph/2);
          c.fill();

          // Little cabin
          c.fillStyle = "#a0522d";
          c.fillRect(-pw/5, ph/4, 45, 35);
          c.fillStyle = "#8b0000"; // roof
          c.beginPath();
          c.moveTo(-pw/5 - 5, ph/4);
          c.lineTo(-pw/5 + 22.5, ph/4 - 15);
          c.lineTo(-pw/5 + 50, ph/4);
          c.fill();
        });

        // 2. Midnight Pine Forest
        drawProceduralPhoto("Forêt de pins sous la Lune, 1991", 620, 40, 460, 350, 2, (c, pw, ph) => {
          // sky
          const sky = c.createLinearGradient(0, -ph/2, 0, ph/2);
          sky.addColorStop(0, "#0f2027");
          sky.addColorStop(0.5, "#203a43");
          sky.addColorStop(1, "#2c5364");
          c.fillStyle = sky;
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Stars
          c.fillStyle = "#ffffff";
          for (let i = 0; i < 40; i++) {
            c.fillRect(-pw/2 + Math.random() * pw, -ph/2 + Math.random() * ph, 1.5, 1.5);
          }

          // Full Moon
          c.fillStyle = "#f5f5f5";
          c.beginPath();
          c.arc(pw/3, -ph/4, 30, 0, Math.PI * 2);
          c.fill();

          // Trees
          c.fillStyle = "rgba(0,0,0,0.4)";
          const drawTree = (cx: number, cy: number, scale: number) => {
            c.save();
            c.translate(cx, cy);
            c.scale(scale, scale);
            // trunk
            c.fillStyle = "#000000";
            c.fillRect(-4, 0, 8, 25);
            // leaves
            c.fillStyle = "#0c2310";
            c.beginPath();
            c.moveTo(0, -40);
            c.lineTo(25, -5);
            c.lineTo(-25, -5);
            c.closePath();
            c.fill();
            c.beginPath();
            c.moveTo(0, -55);
            c.lineTo(20, -25);
            c.lineTo(-20, -25);
            c.closePath();
            c.fill();
            c.restore();
          };

          drawTree(-pw/3, ph/4, 1.3);
          drawTree(-pw/6, ph/4, 1.5);
          drawTree(pw/8, ph/4, 1.1);
          drawTree(pw/3, ph/4, 1.4);
        });

        // 3. Vintage Beach Palms
        drawProceduralPhoto("Vacances à la mer, 1978", 120, 420, 420, 310, -1.5, (c, pw, ph) => {
          // Warm sunset sky
          const sky = c.createLinearGradient(0, -ph/2, 0, ph/3);
          sky.addColorStop(0, "#f857a6");
          sky.addColorStop(1, "#ff5858");
          c.fillStyle = sky;
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Sun
          c.fillStyle = "#fffc00";
          c.beginPath();
          c.arc(0, ph/6, 60, 0, Math.PI * 2);
          c.fill();

          // Ocean waves
          c.fillStyle = "#3a4f7c";
          c.fillRect(-pw/2, ph/6, pw, ph/2);

          // Waves texture
          c.strokeStyle = "rgba(255,255,255,0.25)";
          c.lineWidth = 3;
          for (let i = ph/6 + 15; i < ph/2; i += 20) {
            c.beginPath();
            c.moveTo(-pw/2, i);
            c.quadraticCurveTo(0, i - 5, pw/2, i);
            c.stroke();
          }

          // Palm tree outline
          c.save();
          c.translate(-pw/4, ph/2);
          c.fillStyle = "#000000";
          c.beginPath();
          c.moveTo(-10, 0);
          c.quadraticCurveTo(-15, -ph/2, 20, -ph * 0.7);
          c.lineTo(28, -ph * 0.68);
          c.quadraticCurveTo(-5, -ph/2, 10, 0);
          c.closePath();
          c.fill();

          // Palm leafs
          c.translate(20, -ph * 0.7);
          c.strokeStyle = "#000000";
          c.lineWidth = 6;
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            c.beginPath();
            c.moveTo(0, 0);
            c.quadraticCurveTo(Math.cos(angle) * 45, Math.sin(angle) * 45 - 10, Math.cos(angle) * 60, Math.sin(angle) * 60);
            c.stroke();
          }
          c.restore();
        });

        // 4. Abstract Art Portrait
        drawProceduralPhoto("Composition Abstraite N°4", 640, 430, 420, 310, 4, (c, pw, ph) => {
          // Yellow field
          c.fillStyle = "#fbc531";
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Red giant circle
          c.fillStyle = "#e84118";
          c.beginPath();
          c.arc(-pw/6, 0, 70, 0, Math.PI * 2);
          c.fill();

          // Blue square intersecting
          c.fillStyle = "rgba(0, 151, 230, 0.8)";
          c.fillRect(0, -ph/4, 120, 120);

          // Grid lines
          c.strokeStyle = "#2f3640";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(-pw/2, -ph/3);
          c.lineTo(pw/2, ph/3);
          c.moveTo(-pw/3, ph/2);
          c.lineTo(pw/3, -ph/2);
          c.stroke();
        });

      } else {
        // --- TRAVEL THEME (Modern colored photo collage) ---
        // 1. Majestic Fuji Mount
        drawProceduralPhoto("Kyoto Summit", 100, 70, 440, 320, 1, (c, pw, ph) => {
          const sky = c.createLinearGradient(0, -ph/2, 0, ph/2);
          sky.addColorStop(0, "#4a00e0");
          sky.addColorStop(1, "#8e2de2");
          c.fillStyle = sky;
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Big Pink Sun
          c.fillStyle = "#ff007f";
          c.beginPath();
          c.arc(0, -10, 65, 0, Math.PI*2);
          c.fill();

          // Snow cap peak
          c.fillStyle = "#ffffff";
          c.beginPath();
          c.moveTo(-100, ph/2);
          c.lineTo(0, -ph/4);
          c.lineTo(100, ph/2);
          c.closePath();
          c.fill();

          // Shade on mountain
          c.fillStyle = "#cfd8dc";
          c.beginPath();
          c.moveTo(0, -ph/4);
          c.lineTo(100, ph/2);
          c.lineTo(0, ph/2);
          c.closePath();
          c.fill();

          // Sakura branch silhouette
          c.strokeStyle = "#212121";
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(-pw/2, -ph/2);
          c.quadraticCurveTo(-pw/4, -ph/3, 0, -ph/2.5);
          c.stroke();

          // Blossoms
          c.fillStyle = "#ffb74d";
          for (let i = 0; i < 8; i++) {
            c.beginPath();
            c.arc(-pw/2 + 25 * i + Math.random()*10, -ph/2 + 15 * i, 6, 0, Math.PI*2);
            c.fill();
          }
        });

        // 2. Greek Blue Dome
        drawProceduralPhoto("Santorini Ocean View", 600, 60, 460, 340, -1.8, (c, pw, ph) => {
          // deep navy ocean to blue sky
          const sky = c.createLinearGradient(0, -ph/2, 0, ph/2);
          sky.addColorStop(0, "#4fc3f7");
          sky.addColorStop(0.5, "#0288d1");
          sky.addColorStop(1, "#01579b");
          c.fillStyle = sky;
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // White buildings block
          c.fillStyle = "#ffffff";
          c.fillRect(-pw/2, ph/10, pw/2, ph/2);
          c.fillRect(0, ph/5, pw/2, ph/2);

          // Greek Dome
          c.fillStyle = "#0d47a1";
          c.beginPath();
          c.arc(-pw/4, ph/10, 50, Math.PI, 0);
          c.fill();

          // Cross on top
          c.strokeStyle = "#ffffff";
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(-pw/4, ph/10 - 58);
          c.lineTo(-pw/4, ph/10 - 45);
          c.moveTo(-pw/4 - 6, ph/10 - 52);
          c.lineTo(-pw/4 + 6, ph/10 - 52);
          c.stroke();
        });

        // 3. Desert Oasis
        drawProceduralPhoto("Sahara Dunes", 140, 440, 430, 310, 1.5, (c, pw, ph) => {
          const sky = c.createLinearGradient(0, -ph/2, 0, ph/4);
          sky.addColorStop(0, "#40e0d0");
          sky.addColorStop(1, "#ff8c00");
          c.fillStyle = sky;
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Dunes
          c.fillStyle = "#f4a460";
          c.beginPath();
          c.moveTo(-pw/2, ph/2);
          c.quadraticCurveTo(-pw/4, 0, pw/8, ph/2);
          c.closePath();
          c.fill();

          c.fillStyle = "#e9967a";
          c.beginPath();
          c.moveTo(-pw/3, ph/2);
          c.quadraticCurveTo(pw/4, ph/8, pw/2, ph/2);
          c.closePath();
          c.fill();

          // Golden Sun
          c.fillStyle = "#ffa500";
          c.beginPath();
          c.arc(pw/3, -ph/3, 25, 0, Math.PI*2);
          c.fill();

          // Little Camels silhouette
          c.fillStyle = "#4a2711";
          c.fillRect(-20, ph/3, 10, 8); // body
          c.fillRect(-12, ph/3 - 6, 3, 8); // neck
        });

        // 4. Emerald Forest Cascade
        drawProceduralPhoto("Emerald Falls", 630, 440, 440, 310, -0.9, (c, pw, ph) => {
          c.fillStyle = "#004d40";
          c.fillRect(-pw/2, -ph/2, pw, ph);

          // Waterfall streak
          const water = c.createLinearGradient(-30, 0, 30, 0);
          water.addColorStop(0, "#80deea");
          water.addColorStop(0.5, "#e0f7fa");
          water.addColorStop(1, "#4dd0e1");
          c.fillStyle = water;
          c.fillRect(-40, -ph/2, 80, ph);

          // Rocks on sides
          c.fillStyle = "#263238";
          c.beginPath();
          c.moveTo(-pw/2, ph/2);
          c.lineTo(-pw/3, -ph/2);
          c.lineTo(-pw/2, -ph/2);
          c.closePath();
          c.fill();

          c.beginPath();
          c.moveTo(pw/2, ph/2);
          c.lineTo(pw/3, -ph/2);
          c.lineTo(pw/2, -ph/2);
          c.closePath();
          c.fill();

          // Jungle moss greens
          c.fillStyle = "#00c853";
          c.beginPath();
          c.arc(-pw/3, -ph/3, 40, 0, Math.PI*2);
          c.arc(pw/3, ph/5, 45, 0, Math.PI*2);
          c.fill();
        });
      }

      // 3. Export to base64 src
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      setImageSrc(dataUrl);

      // Store simulated high quality meta dimensions
      originalMeta.current = { width: 1200, height: 800 };
      setSheetDimensions({ width: 1200, height: 800 });
      
      setLoadingStep("Planche chargée ! Prête pour l'analyse.");
      setTimeout(() => {
        setLoading(false);
        setLoadingStep("");
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError("Échec lors de la génération de la planche démo.");
      setLoading(false);
    }
  }, []);

  // Handle local file upload
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    loadLocalFile(files[0]);
  };

  const loadLocalFile = (file: File) => {
    setLoading(true);
    setLoadingStep("Chargement de l'image...");
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const srcString = event.target.result as string;
        
        // Load in image to grab exact high-resolution width and height
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          originalMeta.current = { width: w, height: h };
          setSheetDimensions({ width: w, height: h });
          setImageSrc(srcString);
          setDetections([]);
          setCroppedPhotos([]);
          setLoading(false);
          setLoadingStep("");
        };
        img.onerror = () => {
          setError("Ce fichier d'image semble endommagé.");
          setLoading(false);
        };
        img.src = srcString;
      }
    };
    reader.onerror = () => {
      setError("Échec lors du chargement du fichier local.");
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Load Google Auth (GSI) and Picker scripts dynamically
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!document.getElementById("google-gapi-script")) {
      const gapiScript = document.createElement("script");
      gapiScript.id = "google-gapi-script";
      gapiScript.src = "https://apis.google.com/js/api.js";
      gapiScript.async = true;
      gapiScript.defer = true;
      document.body.appendChild(gapiScript);
    }

    if (!document.getElementById("google-gsi-script")) {
      const gsiScript = document.createElement("script");
      gsiScript.id = "google-gsi-script";
      gsiScript.src = "https://accounts.google.com/gsi/client";
      gsiScript.async = true;
      gsiScript.defer = true;
      document.body.appendChild(gsiScript);
    }
  }, []);

  // Save Cloudinary configure changes
  const handleSaveCloudinaryConfig = (name: string, preset: string, folder: string) => {
    setCloudinaryCloudName(name);
    setCloudinaryUploadPreset(preset);
    setCloudinaryFolder(folder);
    if (typeof window !== "undefined") {
      localStorage.setItem("cloudinary_cloud_name", name);
      localStorage.setItem("cloudinary_upload_preset", preset);
      localStorage.setItem("cloudinary_folder", folder);
    }
  };

  // Upload cropped collections to Cloudinary
  const handleUploadAllToCloudinary = async () => {
    if (croppedPhotos.length === 0) {
      setCloudinaryError("Aucun cliché n'est disponible pour l'envoi.");
      return;
    }
    if (!cloudinaryCloudName.trim() || !cloudinaryUploadPreset.trim()) {
      setCloudinaryError("Veuillez renseigner votre Cloud Name et votre Upload Preset Cloudinary.");
      return;
    }

    setIsUploadingToCloudinary(true);
    setCloudinaryProgress("Préparation de l'envoi vers Cloudinary...");
    setCloudinaryError(null);

    const uploadedList = [...cloudinaryUploadedUrls];

    try {
      for (let idx = 0; idx < croppedPhotos.length; idx++) {
        const photo = croppedPhotos[idx];
        setCloudinaryProgress(`Envoi du cliché ${idx + 1} sur ${croppedPhotos.length} : ${photo.label}...`);

        const sanitizedTitle = photo.label
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_-]/g, "_")
          .replace(/_+/g, "_");

        const publicId = `${sanitizedTitle || "photo"}_${Date.now()}`;

        // Fetch image blob from cropped data URI
        const resBlob = await fetch(photo.croppedSrc);
        const blob = await resBlob.blob();

        const formData = new FormData();
        formData.append("file", blob);
        formData.append("upload_preset", cloudinaryUploadPreset.trim());
        formData.append("public_id", publicId);
        if (cloudinaryFolder.trim()) {
          formData.append("folder", cloudinaryFolder.trim());
        }

        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName.trim()}/image/upload`;
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          body: formData
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Code erreur ${uploadRes.status} : ${errText}`);
        }

        const cloudData = await uploadRes.json();
        
        uploadedList.unshift({
          id: photo.id,
          label: photo.label,
          url: cloudData.url,
          secureUrl: cloudData.secure_url,
          bytes: cloudData.bytes,
          format: cloudData.format,
          width: cloudData.width,
          height: cloudData.height
        });
      }

      setCloudinaryUploadedUrls(uploadedList);
      if (typeof window !== "undefined") {
        localStorage.setItem("cloudinary_uploaded_history", JSON.stringify(uploadedList));
      }
      setCloudinaryProgress("✅ Tous vos clichés ont été hébergés sur Cloudinary avec succès !");
      setTimeout(() => {
        setCloudinaryProgress(null);
      }, 6000);
    } catch (err: any) {
      console.error(err);
      setCloudinaryError(`Échec du transfert Cloudinary : ${err.message || err}`);
    } finally {
      setIsUploadingToCloudinary(false);
    }
  };

  const authenticateGoogleDrive = (callback?: (token: string) => void) => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setGoogleConfigModal(true);
      return;
    }

    try {
      const google = (window as any).google;
      if (!google) {
        throw new Error("Les scripts d'authentification Google ne se sont pas encore chargés. Veuillez patienter une seconde.");
      }

      setError(null);
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/picker",
        callback: (response: any) => {
          if (response.error !== undefined) {
            setError(`Erreur lors de l'authentification Google : ${response.error_description || response.error}`);
            return;
          }
          if (response.access_token) {
            setGoogleAccessToken(response.access_token);
            setGoogleConnected(true);
            fetchFolders(response.access_token);
            if (callback) {
              callback(response.access_token);
            }
          } else {
            setError("Aucun jeton d'accès n'a été renvoyé par Google.");
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Impossible d'initier la connexion d'export Google Drive.");
    }
  };

  const fetchFolders = async (token: string) => {
    try {
      const q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=name&pageSize=100&fields=files(id,name)`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleDriveFolders(data.files || []);
      }
    } catch (e) {
      console.error("Error listing Drive folders:", e);
    }
  };

  const handleCreateDriveFolder = async () => {
    if (!googleAccessToken || !googleDriveNewFolderName.trim()) return;
    setIsCreatingFolder(true);
    setDriveUploadError(null);
    try {
      const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: googleDriveNewFolderName.trim(),
          mimeType: "application/vnd.google-apps.folder"
        })
      });
      if (!res.ok) {
        throw new Error("Impossible de créer le dossier sur votre Drive.");
      }
      const data = await res.json();
      setGoogleDriveNewFolderName("");
      setGoogleDriveShowNewFolderInput(false);
      await fetchFolders(googleAccessToken);
      setGoogleDriveSelectedFolder(data.id);
    } catch (err: any) {
      setDriveUploadError(err.message || "Erreur lors de la création du dossier.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameDriveFolder = async (folderId: string, currentName: string) => {
    if (!googleAccessToken) return;
    if (isRenamingFolderId === folderId) {
      if (!googleDriveRenameInput.trim() || googleDriveRenameInput.trim() === currentName) {
        setIsRenamingFolderId(null);
        return;
      }
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: googleDriveRenameInput.trim()
          })
        });
        if (!res.ok) throw new Error("Échec du renommage sur Google Drive.");
        await fetchFolders(googleAccessToken);
        setIsRenamingFolderId(null);
      } catch (err: any) {
        setDriveUploadError(err.message || "Erreur lors du renommage du dossier.");
      }
    } else {
      setGoogleDriveRenameInput(currentName);
      setIsRenamingFolderId(folderId);
    }
  };

  const handleDeleteDriveFolder = async (folderId: string) => {
    if (!googleAccessToken) return;
    const confirmed = window.confirm("Confirmez-vous la suppression de ce dossier sur Google Drive ?");
    if (!confirmed) return;
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      if (!res.ok) throw new Error("Échec de la suppression sur Google Drive.");
      await fetchFolders(googleAccessToken);
      setGoogleDriveSelectedFolder("root");
    } catch (err: any) {
      setDriveUploadError(err.message || "Erreur lors de la suppression du dossier.");
    }
  };

  const handleUploadAllToDrive = async () => {
    if (!googleAccessToken || croppedPhotos.length === 0) return;
    setIsUploadingToDrive(true);
    setDriveUploadProgress("Préparation de l'envoi...");
    setDriveUploadError(null);

    const folderId = googleDriveSelectedFolder === "root" ? null : googleDriveSelectedFolder;

    try {
      for (let idx = 0; idx < croppedPhotos.length; idx++) {
        const photo = croppedPhotos[idx];
        setDriveUploadProgress(`Téléversement du cliché ${idx + 1} sur ${croppedPhotos.length} : ${photo.label}...`);

        const sanitizedTitle = photo.label
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_-]/g, "_")
          .replace(/_+/g, "_");
        
        const filename = `${idx + 1}_${sanitizedTitle || "photo"}.jpg`;

        // Upload
        const resBlob = await fetch(photo.croppedSrc);
        const blob = await resBlob.blob();

        const boundary = "photo_cutter_boundary_upload";
        const metadata = {
          name: filename,
          mimeType: blob.type || "image/jpeg",
          parents: folderId ? [folderId] : undefined
        };

        // read to base64
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const resultSrc = reader.result as string;
              const base64Data = resultSrc.split(",")[1];

              const multipartBody = 
                `--${boundary}\r\n` +
                `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                JSON.stringify(metadata) + `\r\n` +
                `--${boundary}\r\n` +
                `Content-Transfer-Encoding: base64\r\n` +
                `Content-Type: ${blob.type || "image/jpeg"}\r\n\r\n` +
                base64Data + `\r\n` +
                `--${boundary}--`;

              const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${googleAccessToken}`,
                  "Content-Type": `multipart/related; boundary=${boundary}`
                },
                body: multipartBody
              });

              if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                throw new Error(`Erreur du serveur Drive (${uploadRes.status})`);
              }
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error("Échec du décodage du fichier image."));
          reader.readAsDataURL(blob);
        });
      }

      setDriveUploadProgress("✅ Félicitations! Tous vos clichés ont été enregistrés avec succès.");
      setGoogleDriveNewFolderName("");
      setGoogleDriveShowNewFolderInput(false);
      setTimeout(() => {
        setDriveUploadProgress(null);
      }, 6000);
    } catch (err: any) {
      console.error(err);
      setDriveUploadError(`Échec du transfert : ${err.message || err}`);
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const handleGooglePicker = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

    if (!clientId) {
      setGoogleConfigModal(true);
      return;
    }

    const launchPicker = (token: string) => {
      setLoading(true);
      setLoadingStep("Initialisation de de Google Drive Picker...");

      const gapi = (window as any).gapi;
      const google = (window as any).google;

      if (!gapi || !google) {
        setLoading(false);
        setError("Les bibliothèques Google ne se sont pas encore chargées. Veuillez patienter.");
        return;
      }

      gapi.load("picker", () => {
        const pickerOrigin =
          window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
            ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
            : window.location.origin;

        const view = new google.picker.View(google.picker.ViewId.DOCS);
        view.setMimeTypes("image/jpeg,image/png,image/webp,image/gif,image/bmp");

        const pickerBuilder = new google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setCallback(async (data: any) => {
            if (data.action === google.picker.Action.PICKED) {
              const doc = data.docs[0];
              const fileId = doc.id;
              const fileName = doc.name;

              setLoading(true);
              setLoadingStep(`Téléchargement de : ${fileName} depuis votre Drive...`);

              try {
                const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
                const resp = await fetch(downloadUrl, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });

                if (!resp.ok) {
                  throw new Error(`Code de statut HTTP ${resp.status}`);
                }

                const blob = await resp.blob();
                const fileObj = new File([blob], fileName, { type: blob.type || "image/jpeg" });
                loadLocalFile(fileObj);
              } catch (err: any) {
                console.error("Failed to load Google Drive file:", err);
                setError(`Échec de récupération du fichier : ${err.message || err}`);
                setLoading(false);
              }
            } else if (data.action === google.picker.Action.CANCEL) {
              setLoading(false);
            }
          })
          .setOrigin(pickerOrigin);

        if (apiKey) {
          pickerBuilder.setDeveloperKey(apiKey);
        }

        const picker = pickerBuilder.build();
        picker.setVisible(true);
        setLoading(false);
      });
    };

    if (googleAccessToken) {
      launchPicker(googleAccessToken);
    } else {
      authenticateGoogleDrive((token) => launchPicker(token));
    }
  };

  // Drag and drop event handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      loadLocalFile(files[0]);
    }
  };

  // Ask Gemini to detect photos
  const handleDetectPhotos = async () => {
    if (!imageSrc) return;
    setLoading(true);
    setLoadingStep("L'IA analyse de la planche (recherche des cadres de photos)...");
    setError(null);

    try {
      const response = await fetch("/applet/api/detect-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageSrc }),
      });

      // Handle the fallback routing in development containers
      let realRes = response;
      if (response.status === 404) {
        // Retry with pure relative API route in case of router configurations
        realRes = await fetch("/api/detect-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageSrc }),
        });
      }

      if (!realRes.ok) {
        const errorData = await realRes.json();
        throw new Error(errorData.error || "La détection IA a échoué.");
      }

      const data = await realRes.json();
      if (!data.success || !data.photos || !Array.isArray(data.photos)) {
        throw new Error("L'IA n'a retourné aucune coordonnée structurée.");
      }

      // Add high fidelity unique local IDs to each detected crop area
      const parsedDetections: Detection[] = data.photos.map((p: any, idx: number) => {
        // Enforce valid coordinate range [ymin, xmin, ymax, xmax]
        const box = p.box_2d || [100, 100, 400, 400];
        const ymin = Math.max(0, Math.min(1000, box[0]));
        const xmin = Math.max(0, Math.min(1000, box[1]));
        const ymax = Math.max(0, Math.min(1000, box[2]));
        const xmax = Math.max(0, Math.min(1000, box[3]));

        return {
          id: `crop-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
          box_2d: [ymin, xmin, ymax, xmax],
          label: p.label || `Cliché IA #${idx + 1}`,
          suggested_filename: p.suggested_filename || "",
          customized: false,
          rotation: 0,
          brightness: 100,
          contrast: 100,
          grayscale: false,
          sepia: false
        };
      });

      setDetections(parsedDetections);
      setLoadingStep("Détection terminée. Génération des vignettes découpées...");
      
      // Auto-extract cropped images using Canvas
      await processAllCroppedPhotos(parsedDetections);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur lors de la détection IA. Veuillez réessayer.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Extract one single photo from original image with filter transformations at absolute resolution
  const extractPhoto = (det: Detection): Promise<CroppedPhoto> => {
    return new Promise((resolve, reject) => {
      if (!imageSrc) {
        reject("Aucune image source");
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const natW = img.naturalWidth || img.width;
          const natH = img.naturalHeight || img.height;

          // Convert relative coordinates (0-1000) to absolute high resolution source pixels
          const ymin = (det.box_2d[0] / 1000) * natH;
          const xmin = (det.box_2d[1] / 1000) * natW;
          const ymax = (det.box_2d[2] / 1000) * natH;
          const xmax = (det.box_2d[3] / 1000) * natW;

          let cropW = xmax - xmin;
          let cropH = ymax - ymin;

          if (cropW <= 0 || cropH <= 0) {
            cropW = 100;
            cropH = 100;
          }

          // Output canvas size depends on rotation (if 90 or 270, swap dimensions)
          const isRotatedSwapped = det.rotation === 90 || det.rotation === 270;
          const canvas = document.createElement("canvas");
          canvas.width = isRotatedSwapped ? cropH : cropW;
          canvas.height = isRotatedSwapped ? cropW : cropH;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject("Impossible de démarrer le recadrage");
            return;
          }

          // Apply filters to canvas context
          let filterStr = `brightness(${det.brightness}%) contrast(${det.contrast}%)`;
          if (det.grayscale) filterStr += " grayscale(100%)";
          if (det.sepia) filterStr += " sepia(100%)";
          ctx.filter = filterStr;

          // Center coordinate rotation drawing logic
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((det.rotation * Math.PI) / 180);

          // Draw specified crop section onto physical center coordinates
          ctx.drawImage(
            img,
            xmin, ymin, cropW, cropH, // Source sub-rect
            -cropW / 2, -cropH / 2, cropW, cropH // Destination centered rect
          );

          // Extract as high-quality raw JPEG
          const croppedSrc = canvas.toDataURL("image/jpeg", 0.95);
          resolve({
            id: det.id,
            label: det.label,
            croppedSrc,
            detection: det,
          });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject("Échec de chargement de l'image source");
      img.src = imageSrc;
    });
  };

  // Re-process all detections in bulk
  const processAllCroppedPhotos = async (detList: Detection[]) => {
    try {
      const results: CroppedPhoto[] = [];
      for (const det of detList) {
        const cropRes = await extractPhoto(det);
        results.push(cropRes);
      }
      setCroppedPhotos(results);
    } catch (e) {
      console.error("Erreur de régénération des vignettes:", e);
    }
  };

  // Process one single photo and slip it back into state (extremely performant for adjusting sliders live!)
  const reProcessSinglePhoto = async (updatedDet: Detection) => {
    try {
      const result = await extractPhoto(updatedDet);
      setCroppedPhotos((prev) => 
        prev.map((photo) => (photo.id === updatedDet.id ? result : photo))
      );
    } catch (e) {
      console.error("Erreur mise à jour live photo:", e);
    }
  };

  // Trigger individual detection adjustments
  const updateDetectionField = <K extends keyof Detection>(id: string, key: K, value: Detection[K], immediateRecrop = true) => {
    setDetections((prev) => {
      const next = prev.map((det) => {
        if (det.id === id) {
          const updated = { 
            ...det, 
            [key]: value,
            ...(key as string === "label" ? { customized: true } : {})
          };
          if (immediateRecrop) {
            reProcessSinglePhoto(updated);
          }
          return updated;
        }
        return det;
      });
      return next;
    });
  };

  // Helper to calculate preview boxes for the regular layout
  const calculateGridBoxes = useCallback((): { box_2d: [number, number, number, number]; id: string; row: number; col: number }[] => {
    const boxes: { box_2d: [number, number, number, number]; id: string; row: number; col: number }[] = [];
    if (gridRows <= 0 || gridCols <= 0) return [];

    const p = Math.max(0, Math.min(45, gridMarginPercent)); // bound layout padding
    const ymin_active = p * 10;
    const ymax_active = 1000 - p * 10;
    const xmin_active = p * 10;
    const xmax_active = 1000 - p * 10;

    const H_active = ymax_active - ymin_active;
    const W_active = xmax_active - xmin_active;

    const cell_h = H_active / gridRows;
    const cell_w = W_active / gridCols;

    for (let r = 0; r < gridRows; r++) {
      const cell_top = ymin_active + r * cell_h;
      const cell_bottom = cell_top + cell_h;

      // Base offsets + individual edge extremities offsets
      const row_offset = gridRowOffsets[r] || 0;
      const top_edge_adj = gridRowTops[r] || 0;
      const bottom_edge_adj = gridRowBottoms[r] || 0;

      for (let c = 0; c < gridCols; c++) {
        const cell_left = xmin_active + c * cell_w;
        const cell_right = cell_left + cell_w;

        const col_offset = gridColOffsets[c] || 0;
        const left_edge_adj = gridColLefts[c] || 0;
        const right_edge_adj = gridColRights[c] || 0;

        // Individual cell overrides
        const cellKey = `${r}-${c}`;
        const cell_top_override = gridCellTops[cellKey] || 0;
        const cell_bottom_override = gridCellBottoms[cellKey] || 0;
        const cell_left_override = gridCellLefts[cellKey] || 0;
        const cell_right_override = gridCellRights[cellKey] || 0;

        // Calculate final boundaries incorporating row/col basics AND cell-specific tweaks
        const current_cell_top = cell_top + row_offset + top_edge_adj + cell_top_override;
        const current_cell_bottom = cell_bottom + row_offset - bottom_edge_adj - cell_bottom_override;
        const current_cell_h = Math.max(10, current_cell_bottom - current_cell_top);

        const fh_coef = Math.max(10, Math.min(100, gridHeightPercent)) / 100;
        const frame_h = current_cell_h * fh_coef;
        
        const ymin_frame = current_cell_top + (current_cell_h - frame_h) / 2;
        const ymax_frame = ymin_frame + frame_h;

        const current_cell_left = cell_left + col_offset + left_edge_adj + cell_left_override;
        const current_cell_right = cell_right + col_offset - right_edge_adj - cell_right_override;
        const current_cell_w = Math.max(10, current_cell_right - current_cell_left);

        const fw_coef = Math.max(10, Math.min(100, gridWidthPercent)) / 100;
        const frame_w = current_cell_w * fw_coef;

        const xmin_frame = current_cell_left + (current_cell_w - frame_w) / 2;
        const xmax_frame = xmin_frame + frame_w;

        // round to precision integers
        const roundedBox: [number, number, number, number] = [
          Math.max(0, Math.min(1000, Math.round(ymin_frame))),
          Math.max(0, Math.min(1000, Math.round(xmin_frame))),
          Math.max(0, Math.min(1000, Math.round(ymax_frame))),
          Math.max(0, Math.min(1000, Math.round(xmax_frame)))
        ];

        boxes.push({
          box_2d: roundedBox,
          id: `grid-preview-${r}-${c}`,
          row: r,
          col: c
        });
      }
    }
    return boxes;
  }, [
    gridRows, 
    gridCols, 
    gridWidthPercent, 
    gridHeightPercent, 
    gridMarginPercent, 
    gridRowOffsets, 
    gridColOffsets,
    gridRowTops,
    gridRowBottoms,
    gridColLefts,
    gridColRights,
    gridCellTops,
    gridCellBottoms,
    gridCellLefts,
    gridCellRights
  ]);

  const updateRowTop = (rowIndex: number, val: number) => {
    setGridRowTops((prev) => {
      const copy = [...prev];
      while (copy.length <= rowIndex) copy.push(0);
      copy[rowIndex] = val;
      return copy;
    });
  };

  const updateRowBottom = (rowIndex: number, val: number) => {
    setGridRowBottoms((prev) => {
      const copy = [...prev];
      while (copy.length <= rowIndex) copy.push(0);
      copy[rowIndex] = val;
      return copy;
    });
  };

  const updateColLeft = (colIndex: number, val: number) => {
    setGridColLefts((prev) => {
      const copy = [...prev];
      while (copy.length <= colIndex) copy.push(0);
      copy[colIndex] = val;
      return copy;
    });
  };

  const updateColRight = (colIndex: number, val: number) => {
    setGridColRights((prev) => {
      const copy = [...prev];
      while (copy.length <= colIndex) copy.push(0);
      copy[colIndex] = val;
      return copy;
    });
  };

  // Apply grid pattern as real detections and trigger extraction
  const handleApplyGridSlices = async () => {
    if (!imageSrc) return;
    setLoading(true);
    setLoadingStep("Génération des cadres de la grille...");
    
    const boxesData = calculateGridBoxes();
    const newDetections: Detection[] = [];
    
    for (let i = 0; i < boxesData.length; i++) {
      const b = boxesData[i];
      const newId = generateUniqueId(`crop-grid-${b.row}-${b.col}`);
      newDetections.push({
        id: newId,
        box_2d: b.box_2d,
        label: `Cliché Grille R${b.row + 1}C${b.col + 1}`,
        rotation: 0,
        brightness: 100,
        contrast: 100,
        grayscale: false,
        sepia: false,
        customized: true,
        suggested_filename: `photo_grille_${b.row + 1}_${b.col + 1}`
      });
    }

    setDetections(newDetections);
    setSelectedCropId(newDetections[0]?.id || null);

    setLoadingStep("Extraction des clichés de la grille...");
    try {
      const cropPromises = newDetections.map((det) => extractPhoto(det));
      const crops = await Promise.all(cropPromises);
      setCroppedPhotos(crops);
    } catch (err) {
      console.error("Erreur lors de la découpe en grille:", err);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Add a fully customizable, manual photo frame inside workspace
  const handleAddManualFrame = () => {
    if (!imageSrc) return;
    
    const newId = generateUniqueId("crop-manual");
    const newDet: Detection = {
      id: newId,
      box_2d: [250, 250, 750, 750], // centered 50% square area
      label: `Cadre Manuel #${detections.length + 1}`,
      rotation: 0,
      brightness: 100,
      contrast: 100,
      grayscale: false,
      sepia: false,
      customized: true,
      suggested_filename: `cadre_manuel_${detections.length + 1}`
    };

    const nextDetections = [...detections, newDet];
    setDetections(nextDetections);
    setSelectedCropId(newId);
    
    // Add cropped photo card
    extractPhoto(newDet).then((newCrop) => {
      setCroppedPhotos((prev) => [...prev, newCrop]);
    });
  };

  // Dupliquer un cadre existant (clonage)
  const handleDuplicateCrop = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const detToClone = detections.find((d) => d.id === id);
    if (!detToClone) return;
    
    // Shift slightly to show duplicate clearly (30 units = 3% of the image)
    const [ymin, xmin, ymax, xmax] = detToClone.box_2d;
    const shift = 30;
    
    let nextYmin = ymin + shift;
    let nextXmin = xmin + shift;
    let nextYmax = ymax + shift;
    let nextXmax = xmax + shift;
    
    // Boundary checks to remain within [0, 1000]
    if (nextYmax > 1000) {
      const offset = nextYmax - 1000;
      nextYmin -= offset;
      nextYmax -= offset;
    }
    if (nextXmax > 1000) {
      const offset = nextXmax - 1000;
      nextXmin -= offset;
      nextXmax -= offset;
    }
    
    const newId = generateUniqueId("crop-dup");
    const newDet: Detection = {
      ...detToClone,
      id: newId,
      box_2d: [nextYmin, nextXmin, nextYmax, nextXmax],
      label: `${detToClone.label} (Copie)`,
      suggested_filename: detToClone.suggested_filename 
        ? `${detToClone.suggested_filename}_copie` 
        : `cadre_copie_${detections.length + 1}`,
      customized: true
    };
    
    const nextDetections = [...detections, newDet];
    setDetections(nextDetections);
    setSelectedCropId(newId);
    
    // Add cropped photo card
    extractPhoto(newDet).then((newCrop) => {
      setCroppedPhotos((prev) => [...prev, newCrop]);
    });
  };

  // Delete a photo detection and its corresponding card
  const handleDeleteCrop = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDetections((prev) => prev.filter((d) => d.id !== id));
    setCroppedPhotos((prev) => prev.filter((p) => p.id !== id));
    if (selectedCropId === id) setSelectedCropId(null);
  };

  // Handle workspace mouse actions for visual resizing/dragging
  const handleWorkspaceMouseDown = (
    id: string,
    handle: "tl" | "tr" | "bl" | "br" | "move",
    clientX: number,
    clientY: number
  ) => {
    const targetDet = detections.find((d) => d.id === id);
    if (!targetDet) return;

    setSelectedCropId(id);
    setActiveDrag({
      id,
      handle,
      startX: clientX,
      startY: clientY,
      startBox: [...targetDet.box_2d],
    });
  };

  const handleDocumentMouseMove = useCallback((e: MouseEvent) => {
    if (activeGridDrag && containerRef.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;

      if (activeGridDrag.type === "row") {
        const deltaY = ((e.clientY - activeGridDrag.startPos) / bounds.height) * 1000;
        const adjustedDeltaY = deltaY / zoomScale;
        const nextOffset = activeGridDrag.startOffset + adjustedDeltaY;
        const boundedOffset = Math.max(-1000, Math.min(1000, nextOffset));

        setGridRowOffsets((prev) => {
          const next = [...prev];
          next[activeGridDrag.index] = Math.round(boundedOffset);
          return next;
        });
      } else if (activeGridDrag.type === "col") {
        const deltaX = ((e.clientX - activeGridDrag.startPos) / bounds.width) * 1000;
        const adjustedDeltaX = deltaX / zoomScale;
        const nextOffset = activeGridDrag.startOffset + adjustedDeltaX;
        const boundedOffset = Math.max(-1000, Math.min(1000, nextOffset));

        setGridColOffsets((prev) => {
          const next = [...prev];
          next[activeGridDrag.index] = Math.round(boundedOffset);
          return next;
        });
      }
      return;
    }

    if (!activeDrag || !containerRef.current) return;

    const bounds = containerRef.current.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    // Convert pixel mouse movement deltas into proportional (0-1000) coordinates
    const deltaX = ((e.clientX - activeDrag.startX) / bounds.width) * 1000;
    const deltaY = ((e.clientY - activeDrag.startY) / bounds.height) * 1000;

    const [ymin, xmin, ymax, xmax] = activeDrag.startBox;
    let nextYmin = ymin;
    let nextXmin = xmin;
    let nextYmax = ymax;
    let nextXmax = xmax;

    const limit = (val: number) => Math.max(0, Math.min(1000, Math.round(val)));

    if (activeDrag.handle === "tl") {
      nextYmin = limit(ymin + deltaY);
      nextXmin = limit(xmin + deltaX);
      if (nextYmin >= nextYmax - 30) nextYmin = nextYmax - 30;
      if (nextXmin >= nextXmax - 30) nextXmin = nextXmax - 30;
    } else if (activeDrag.handle === "tr") {
      nextYmin = limit(ymin + deltaY);
      nextXmax = limit(xmax + deltaX);
      if (nextYmin >= nextYmax - 30) nextYmin = nextYmax - 30;
      if (nextXmax <= nextXmin + 30) nextXmax = nextXmin + 30;
    } else if (activeDrag.handle === "bl") {
      nextYmax = limit(ymax + deltaY);
      nextXmin = limit(xmin + deltaX);
      if (nextYmax <= nextYmin + 30) nextYmax = nextYmin + 30;
      if (nextXmin >= nextXmax - 30) nextXmin = nextXmax - 30;
    } else if (activeDrag.handle === "br") {
      nextYmax = limit(ymax + deltaY);
      nextXmax = limit(xmax + deltaX);
      if (nextYmax <= nextYmin + 30) nextYmax = nextYmin + 30;
      if (nextXmax <= nextXmin + 30) nextXmax = nextXmin + 30;
    } else if (activeDrag.handle === "move") {
      const w = xmax - xmin;
      const h = ymax - ymin;
      nextXmin = xmin + deltaX;
      nextYmin = ymin + deltaY;

      // Bound checks for full box translation
      if (nextXmin < 0) nextXmin = 0;
      if (nextYmin < 0) nextYmin = 0;
      
      let nextXmaxComputed = nextXmin + w;
      let nextYmaxComputed = nextYmin + h;

      if (nextXmaxComputed > 1000) {
        nextXmaxComputed = 1000;
        nextXmin = nextXmaxComputed - w;
      }
      if (nextYmaxComputed > 1000) {
        nextYmaxComputed = 1000;
        nextYmin = nextYmaxComputed - h;
      }

      nextXmin = Math.round(nextXmin);
      nextYmin = Math.round(nextYmin);
      nextXmax = Math.round(nextXmaxComputed);
      nextYmax = Math.round(nextYmaxComputed);
    }

    setDetections((prev) => 
      prev.map((det) => {
        if (det.id === activeDrag.id) {
          return {
            ...det,
            box_2d: [nextYmin, nextXmin, nextYmax, nextXmax],
          };
        }
        return det;
      })
    );
  }, [activeDrag, activeGridDrag, zoomScale]);

  const handleDocumentMouseUp = useCallback(() => {
    if (activeGridDrag) {
      setActiveGridDrag(null);
    }
    if (activeDrag) {
      // Find the adjusted crop and trigger high-res Canvas recrop immediately on release!
      const finalDet = detections.find((d) => d.id === activeDrag.id);
      if (finalDet) {
        reProcessSinglePhoto(finalDet);
      }
      setActiveDrag(null);
    }
  }, [activeDrag, activeGridDrag, detections]);

  // Bind mouse move and mouse up listeners at window level for flawless drag behavior outside canvas
  useEffect(() => {
    if (activeDrag || activeGridDrag) {
      window.addEventListener("mousemove", handleDocumentMouseMove);
      window.addEventListener("mouseup", handleDocumentMouseUp);
    } else {
      window.removeEventListener("mousemove", handleDocumentMouseMove);
      window.removeEventListener("mouseup", handleDocumentMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleDocumentMouseMove);
      window.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [activeDrag, activeGridDrag, handleDocumentMouseMove, handleDocumentMouseUp]);

  // Download individual photo directly
  const handleDownloadSingle = (photo: CroppedPhoto) => {
    const link = document.createElement("a");
    link.href = photo.croppedSrc;
    // Format sanitized filename
    const sanitizedTitle = photo.label
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_");
    
    link.download = `${sanitizedTitle || "photo"}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download all photos sequentially in order
  const handleDownloadAll = () => {
    if (croppedPhotos.length === 0) return;
    
    croppedPhotos.forEach((photo, idx) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = photo.croppedSrc;
        const sanitizedTitle = photo.label
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_-]/g, "_")
          .replace(/_+/g, "_");
        link.download = `${idx + 1}_${sanitizedTitle || "photo"}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, idx * 350); // small staggered delay to ensure normal browser queue handles separate downloads
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased selection:bg-indigo-100 selection:text-indigo-950">
      {/* HEADER BAR */}
      <header id="app-header" className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-40 shrink-0 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-8.5 h-8.5 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-600/20">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 font-display leading-tight">CUTTER<span className="text-indigo-600">.AI</span></h1>
            <p className="text-[10px] text-slate-400 font-semibold font-mono uppercase tracking-wider leading-none">Analyse Géométrique Active</p>
          </div>
        </div>
        
        {imageSrc && (
          <div className="flex items-center space-x-3">
            <button
              id="btn-toggle-grid-slicer"
              onClick={() => {
                setShowGridSlicer(!showGridSlicer);
                setError(null);
              }}
              disabled={loading}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                showGridSlicer
                  ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                  : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-sm"
              }`}
              title="Découpage régulier en lignes et colonnes"
            >
              <Grid className={`w-4 h-4 ${showGridSlicer ? "text-white" : "text-emerald-600"}`} />
              <span>{"Découper en Grille"}</span>
            </button>
            <button
              id="btn-add-manual"
              onClick={handleAddManualFrame}
              disabled={loading}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>Cadrer Manuellement</span>
            </button>
            <button
              id="btn-trigger-ai"
              onClick={handleDetectPhotos}
              disabled={loading}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-650/15 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Détecter IA ✨</span>
            </button>
            <button
              id="btn-reset-app"
              onClick={handleReset}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Nouvelle planche"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* CORE CONTENT LAYOUT */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* LANDING PAGE (NO IMAGE YET) */}
        {!imageSrc ? (
          <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center items-center">
            
            {/* HERO INTRODUCTION */}
            <div className="text-center max-w-xl mb-10">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-600 mb-4 tracking-wider uppercase font-mono shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Détection de silhouettes intelligente</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-3 text-slate-900 font-display">{"Découpez vos planches de photos en un clin d'œil"}</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                {"Importez un scan de vieil album, une planche d'identité, une mosaïque de photos ou de polaroïds. L'intelligence d'analyse géométrique détectera chaque cliché, redressera vos photos, et vous proposera de les ajuster et de les télécharger séparément."}
              </p>
            </div>

            {/* DRAG AND DROP ZONE */}
            <div
              id="drop-zone"
              onDragOver={onDragOver}
              onDrop={onDrop}
              className="w-full max-w-2xl bg-white border-2 border-dashed border-slate-250 hover:border-indigo-500 rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all shadow-sm relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                <Scissors className="w-40 h-40 text-slate-900" />
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl mb-4 text-slate-400 border border-slate-100 group-hover:text-indigo-600 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition shadow-inner">
                <Upload className="w-8 h-8 stroke-[1.8]" />
              </div>

              <h3 className="font-bold text-slate-850">Glissez-déposez votre planche de scan de photos</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-normal font-medium">
                Prend en charge les formats haute définition : JPEG, PNG, WebP
              </p>

              <div className="mt-6 flex flex-wrap gap-3 justify-center items-center">
                <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl inline-flex items-center space-x-2 shadow-md transition">
                  <Plus className="w-4 h-4" />
                  <span>Sélectionner un fichier</span>
                  <input
                    id="file-input"
                    type="file"
                    accept="image/*"
                    onChange={onFileChange}
                    className="hidden"
                  />
                </label>

                <button
                  id="btn-google-picker"
                  type="button"
                  onClick={handleGooglePicker}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl inline-flex items-center space-x-2 shadow-md transition cursor-pointer"
                >
                  <Cloud className="w-4 h-4" />
                  <span>Ouvrir depuis Google Drive</span>
                </button>
              </div>
            </div>

            {/* DEMONSTRATION SECTION */}
            <div className="w-full max-w-2xl mt-10 border-t border-slate-200 pt-8">
              <div className="flex items-center space-x-1.5 text-xs text-slate-450 font-bold uppercase tracking-wider mb-4 font-mono">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>Pas de scan sous la main ? Testez avec nos planches générées :</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* RETRO PRESET */}
                <button
                  id="btn-demo-retro"
                  onClick={() => handleLoadDemo("retro")}
                  disabled={loading}
                  className="flex items-start space-x-4 p-5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md text-left transition group shadow-xs"
                >
                  <div className="bg-slate-50 p-2.5 rounded-lg text-slate-450 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition border border-slate-100 flex-shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 transition">Planche Rétro Vintage (4 clichés)</h4>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      Composition nostalgique simulant de vieux souvenirs argentiques couchés sur un classeur, idéal pour tester la détection IA.
                    </p>
                  </div>
                </button>

                {/* TRAVEL PRESET */}
                <button
                  id="btn-demo-travel"
                  onClick={() => handleLoadDemo("travel")}
                  disabled={loading}
                  className="flex items-start space-x-4 p-5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md text-left transition group shadow-xs"
                >
                  <div className="bg-slate-50 p-2.5 rounded-lg text-slate-450 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition border border-slate-100 flex-shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 transition">Planche Voyages Couleurs (4 clichés)</h4>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      Quatre images colorées inspirées du monde (Kyoto, Santorin, Sahara...) alignées avec précision avec de belles marges blanches.
                    </p>
                  </div>
                </button>
              </div>
            </div>

          </div>
        ) : (
          
          /* ACTIVE WORKSPACE */
          <div className="flex-1 flex flex-col overflow-y-auto h-full p-6 gap-6 bg-slate-55">
            
            {/* TOP AREA: side-by-side for Photo (Left) & Controls (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT: PHOTO (col-span-7) */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-left">
              
              {/* ACCESSIBILITY / NOTIFICATION FOR API ACCESS GRIEF (403 Fallback) */}
              {imageSrc && error && (error.includes("denied access") || error.includes("403") || error.includes("PERMISSION_DENIED")) && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left shadow-sm animate-fade-in">
                  <div className="flex items-start space-x-3">
                    <Sparkles className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-xs text-amber-800">{"Note sur la détection automatique IA (Erreur d'accès)"}</h4>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {"Le service d'analyse IA automatique rencontre une restriction d'accès temporaire sur cette session."} 
                        <strong>{" Pas d'inquiétude ! "}</strong>
                        {"Notre outil est entièrement équipé pour le détourage manuel de précision : utilisez l'appareil photo, dupliquez les cadres, et ajustez-les avec l'aide des repères d'alignement."}
                      </p>
                      <div className="mt-3 flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setError(null);
                            handleAddManualFrame();
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{"Créer mon premier cadre manuel"}</span>
                        </button>
                        <button
                          onClick={() => setError(null)}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-lg text-xs font-medium transition"
                        >
                          {"Fermer l'avis"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INTEGRATED ALIGNMENT GRID AND ZOOM HEADER */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white p-3 border border-slate-250 rounded-xl shadow-xs">
                {/* Information Title Block */}
                <div id="workspace-title" className="flex items-center space-x-3">
                  <span className="text-[10px] bg-slate-900 text-white px-2.5 py-1 rounded-md font-mono uppercase tracking-wider font-bold">
                    {"Planche Active"}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold font-mono">
                    {sheetDimensions.width} × {sheetDimensions.height} px
                  </span>
                  {zoomScale > 1 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                      {"🔍 Zoomé - Glissez l'image pour vous déplacer"}
                    </span>
                  )}
                </div>
                
                {/* Workspace grid & scale controls */}
                <div className="flex items-center flex-wrap gap-3">
                  
                  {/* Alignment lines toggle */}
                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                    <button
                      onClick={() => setGridType("none")}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded transition ${gridType === "none" ? "bg-white text-slate-800 shadow-xs" : "text-slate-450 hover:text-slate-700"}`}
                      title="Pas de grille d'alignement"
                    >
                      Sans Grille
                    </button>
                    <button
                      onClick={() => setGridType("thirds")}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded transition ${gridType === "thirds" ? "bg-white text-slate-800 shadow-xs" : "text-slate-450 hover:text-slate-700"}`}
                      title="Utiliser la règle des tiers (3x3)"
                    >
                      Tiers (3x3)
                    </button>
                    <button
                      onClick={() => setGridType("fine")}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded transition ${gridType === "fine" ? "bg-white text-slate-800 shadow-xs" : "text-slate-450 hover:text-slate-700"}`}
                      title="Utiliser un grillage quadrillé fin (8x8)"
                    >
                      Graticule (8x8)
                    </button>
                  </div>

                  <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>

                  {/* Zoom controls */}
                  <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                    <button
                      onClick={() => {
                        const nextZoom = Math.max(1, zoomScale - 0.25);
                        setZoomScale(nextZoom);
                        if (nextZoom === 1) setPanOffset({ x: 0, y: 0 });
                      }}
                      className="p-1 hover:bg-slate-200 text-slate-650 rounded transition disabled:opacity-30"
                      title="Zoom Arrière (-25%)"
                      disabled={zoomScale <= 1}
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    
                    <span className="text-[10px] font-mono font-bold text-slate-700 w-9 text-center select-none">
                      {Math.round(zoomScale * 100)}%
                    </span>
                    
                    <button
                      onClick={() => setZoomScale(Math.min(4, zoomScale + 0.25))}
                      className="p-1 hover:bg-slate-200 text-slate-650 rounded transition disabled:opacity-30"
                      title="Zoom Avant (+25%)"
                      disabled={zoomScale >= 4}
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    
                    {zoomScale > 1 && (
                      <button
                        onClick={() => {
                          setZoomScale(1);
                          setPanOffset({ x: 0, y: 0 });
                        }}
                        className="p-1 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 rounded transition"
                        title="Réinitialiser Zoom & Déplacement"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin-reverse-once" />
                      </button>
                    )}
                  </div>

                </div>
              </div>

              {/* THE GRID CROPPING PANEL (Moved to right settings column) */}
              {imageSrc && false && showGridSlicer && (
                <div className="mb-4 p-5 bg-white border border-slate-200 rounded-xl shadow-sm text-left animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-105 pb-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                        <Grid className="w-4 h-4 text-emerald-650" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-slate-800">
                          {"Découpage en Grille de Précision"}
                        </h4>
                        <p className="text-[10.5px] text-slate-450 font-medium mt-0.5">
                          {"Spécifiez la grille, puis GLISSEZ LES BULLES (L1, C1...) directement sur l'image pour aligner parfaitement vos clichés avant la découpe."}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowGridSlicer(false)}
                      className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
                      title="Masquer le panneau de grille"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Rows and Cols */}
                    <div className="space-y-4">
                      {/* Rows Control */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">
                            {"Lignes (Rangées)"}
                          </label>
                          <span className="text-xs font-mono font-extrabold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                            {gridRows}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <input
                            type="range"
                            min="1"
                            max="12"
                            value={gridRows}
                            onChange={(e) => setGridRows(parseInt(e.target.value) || 1)}
                            className="w-full accent-emerald-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                          />
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={gridRows}
                            onChange={(e) => setGridRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                            className="w-14 text-center text-xs font-bold font-mono border border-slate-200 rounded-lg px-1.5 py-1 bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>

                      {/* Cols Control */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">
                            {"Colonnes"}
                          </label>
                          <span className="text-xs font-mono font-extrabold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                            {gridCols}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <input
                            type="range"
                            min="1"
                            max="12"
                            value={gridCols}
                            onChange={(e) => setGridCols(parseInt(e.target.value) || 1)}
                            className="w-full accent-emerald-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                          />
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={gridCols}
                            onChange={(e) => setGridCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                            className="w-14 text-center text-xs font-bold font-mono border border-slate-200 rounded-lg px-1.5 py-1 bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Dimensions / Bounding box sizes inside grid cell (Tailles et Hauteurs) */}
                    <div className="space-y-4">
                      {/* Width factor */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono" title="Ajuster la largeur de chaque découpe de photo">
                            {"% Largeur des cadres (Tailles)"}
                          </label>
                          <span className="text-xs font-mono font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">
                            {gridWidthPercent}%
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={gridWidthPercent}
                            onChange={(e) => setGridWidthPercent(parseInt(e.target.value) || 90)}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                          />
                          <input
                            type="number"
                            min="10"
                            max="100"
                            value={gridWidthPercent}
                            onChange={(e) => setGridWidthPercent(Math.max(10, Math.min(100, parseInt(e.target.value) || 90)))}
                            className="w-14 text-center text-xs font-bold font-mono border border-slate-200 rounded-lg px-1.5 py-1 bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>

                      {/* Height factor */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono" title="Ajuster la hauteur de chaque découpe de photo">
                            {"% Hauteur des cadres (Hauteurs)"}
                          </label>
                          <span className="text-xs font-mono font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">
                            {gridHeightPercent}%
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={gridHeightPercent}
                            onChange={(e) => setGridHeightPercent(parseInt(e.target.value) || 90)}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                          />
                          <input
                            type="number"
                            min="10"
                            max="100"
                            value={gridHeightPercent}
                            onChange={(e) => setGridHeightPercent(Math.max(10, Math.min(100, parseInt(e.target.value) || 90)))}
                            className="w-14 text-center text-xs font-bold font-mono border border-slate-200 rounded-lg px-1.5 py-1 bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CELL-BY-CELL FINE TUNING CONTROL PANEL */}
                  {showGridSlicer && (
                    <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <Scissors className="w-3.5 h-3.5 text-indigo-650 animate-pulse" />
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide font-sans">
                            {"Marges par case individuelle"}
                          </h4>
                        </div>
                        {selectedGridCell && (
                          <button
                            type="button"
                            onClick={() => setSelectedGridCell(null)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 font-bold font-mono uppercase tracking-wide cursor-pointer"
                          >
                            {"Désélectionner ✕"}
                          </button>
                        )}
                      </div>

                      {selectedGridCell ? (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3.5 shadow-2xs">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black font-mono text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded">
                              {`📍 CASE SEUL : L${selectedGridCell!.row + 1} C${selectedGridCell!.col + 1}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const key = `${selectedGridCell!.row}-${selectedGridCell!.col}`;
                                setGridCellTops((p) => { const copy = { ...p }; delete copy[key]; return copy; });
                                setGridCellBottoms((p) => { const copy = { ...p }; delete copy[key]; return copy; });
                                setGridCellLefts((p) => { const copy = { ...p }; delete copy[key]; return copy; });
                                setGridCellRights((p) => { const copy = { ...p }; delete copy[key]; return copy; });
                              }}
                              className="text-[9.5px] text-indigo-600 hover:text-indigo-805 underline font-bold uppercase tracking-wide cursor-pointer"
                            >
                              {"Réinitialiser celle-ci"}
                            </button>
                          </div>

                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            {"Ajustez les marges intérieures/extérieures de cette case pour corriger précisément les défauts d'alignement."}
                          </p>

                          <div className="grid grid-cols-1 gap-2.5 pt-1">
                            {/* TOP MARGIN */}
                            <div className="space-y-1 bg-white p-2 border border-indigo-100 rounded-lg">
                              <div className="flex justify-between items-center text-[9.5px] font-mono">
                                <span className="text-slate-400">{"⬆ Marge haute (in/out)"}</span>
                                <span className="text-indigo-600 font-bold">
                                  {(gridCellTops[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0) > 0 ? `+` : ""}
                                  {gridCellTops[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0} pts
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-80"
                                max="80"
                                value={gridCellTops[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setGridCellTops((p) => ({ ...p, [`${selectedGridCell!.row}-${selectedGridCell!.col}`]: val }));
                                }}
                                className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-indigo-600"
                              />
                            </div>

                            {/* BOTTOM MARGIN */}
                            <div className="space-y-1 bg-white p-2 border border-indigo-100 rounded-lg">
                              <div className="flex justify-between items-center text-[9.5px] font-mono">
                                <span className="text-slate-400">{"⬇ Marge basse (in/out)"}</span>
                                <span className="text-indigo-600 font-bold">
                                  {(gridCellBottoms[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0) > 0 ? `+` : ""}
                                  {gridCellBottoms[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0} pts
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-80"
                                max="80"
                                value={gridCellBottoms[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setGridCellBottoms((p) => ({ ...p, [`${selectedGridCell!.row}-${selectedGridCell!.col}`]: val }));
                                }}
                                className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-indigo-600"
                              />
                            </div>

                            {/* LEFT MARGIN */}
                            <div className="space-y-1 bg-white p-2 border border-indigo-100 rounded-lg">
                              <div className="flex justify-between items-center text-[9.5px] font-mono">
                                <span className="text-slate-400">{"⬅ Marge gauche (in/out)"}</span>
                                <span className="text-emerald-600 font-bold">
                                  {(gridCellLefts[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0) > 0 ? `+` : ""}
                                  {gridCellLefts[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0} pts
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-80"
                                max="80"
                                value={gridCellLefts[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setGridCellLefts((p) => ({ ...p, [`${selectedGridCell!.row}-${selectedGridCell!.col}`]: val }));
                                }}
                                className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-emerald-600"
                              />
                            </div>

                            {/* RIGHT MARGIN */}
                            <div className="space-y-1 bg-white p-2 border border-indigo-100 rounded-lg">
                              <div className="flex justify-between items-center text-[9.5px] font-mono">
                                <span className="text-slate-400">{"➡ Marge droite (in/out)"}</span>
                                <span className="text-emerald-600 font-bold">
                                  {(gridCellRights[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0) > 0 ? `+` : ""}
                                  {gridCellRights[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0} pts
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-80"
                                max="80"
                                value={gridCellRights[`${selectedGridCell!.row}-${selectedGridCell!.col}`] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setGridCellRights((p) => ({ ...p, [`${selectedGridCell!.row}-${selectedGridCell!.col}`]: val }));
                                }}
                                className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-emerald-600"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                          <p className="text-[10.5px] text-slate-500 leading-relaxed">
                            {"💡 Cliquez directement sur n'importe quelle case de la grille (sur la photo principale) pour l'ajuster de manière 100% indépendante."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPANDABLE SECTION FOR FINE-TUNING INDIVIDUAL ROW/COLUMN EXTREMITIES */}
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setExpandedExtremities(!expandedExtremities)}
                      className="flex items-center justify-between w-full text-left text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50/60 px-3 py-2 rounded-lg transition"
                    >
                      <span className="flex items-center space-x-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{"Ajustement des Extrémités de chaque ligne & colonne (Finition des marges)"}</span>
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-indigo-600 text-white font-black rounded-sm uppercase">
                        {expandedExtremities ? "Masquer ▲" : "Ajuster ▼"}
                      </span>
                    </button>
                    
                    {expandedExtremities && (
                      <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed">
                            {"Ajustez indépendamment les extrémités des lignes (haut/bas) et des colonnes (gauche/droite) pour un alignement au millimètre automatique."}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setGridRowTops(new Array(gridRows).fill(0));
                              setGridRowBottoms(new Array(gridRows).fill(0));
                              setGridColLefts(new Array(gridCols).fill(0));
                              setGridColRights(new Array(gridCols).fill(0));
                            }}
                            className="text-[10px] font-bold font-mono text-indigo-600 hover:text-indigo-800 underline uppercase shrink-0 ml-4 cursor-pointer"
                          >
                            {"Réinitialiser tout"}
                          </button>
                        </div>

                        {/* ROW EXTREMITIES */}
                        <div className="space-y-3">
                          <h5 className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                            {"📐 Extrémités Verticales des Rangées (Hauteur)"}
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {Array.from({ length: gridRows }).map((_, r) => (
                              <div key={`row-ext-${r}`} className="p-2.5 bg-white border border-slate-100 rounded-lg space-y-2 shadow-2xs">
                                <span className="text-[10px] font-extrabold text-slate-600 font-mono">
                                  {`RANGÉE ${r + 1}`}
                                </span>
                                
                                {/* Top Edge slider */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9.5px] font-mono">
                                    <span className="text-slate-400">{"Marge haute"}</span>
                                    <span className="text-indigo-600 font-bold">{(gridRowTops[r] || 0) > 0 ? `+${gridRowTops[r]}` : (gridRowTops[r] || 0)} pts</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={gridRowTops[r] || 0}
                                    onChange={(e) => updateRowTop(r, parseInt(e.target.value) || 0)}
                                    className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-indigo-600"
                                  />
                                </div>

                                {/* Bottom Edge slider */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9.5px] font-mono">
                                    <span className="text-slate-400">{"Marge basse"}</span>
                                    <span className="text-indigo-600 font-bold">{(gridRowBottoms[r] || 0) > 0 ? `+${gridRowBottoms[r]}` : (gridRowBottoms[r] || 0)} pts</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={gridRowBottoms[r] || 0}
                                    onChange={(e) => updateRowBottom(r, parseInt(e.target.value) || 0)}
                                    className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-indigo-600"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* COLUMN EXTREMITIES */}
                        <div className="space-y-3 pt-1 border-t border-slate-100">
                          <h5 className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                            {"📐 Extrémités Horizontales des Colonnes (Largeur)"}
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {Array.from({ length: gridCols }).map((_, c) => (
                              <div key={`col-ext-${c}`} className="p-2.5 bg-white border border-slate-100 rounded-lg space-y-2 shadow-2xs">
                                <span className="text-[10px] font-extrabold text-slate-600 font-mono">
                                  {`COLONNE ${c + 1}`}
                                </span>
                                
                                {/* Left Edge slider */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9.5px] font-mono">
                                    <span className="text-slate-200">{"Marge gauche"}</span>
                                    <span className="text-emerald-600 font-bold">{(gridColLefts[c] || 0) > 0 ? `+${gridColLefts[c]}` : (gridColLefts[c] || 0)} pts</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={gridColLefts[c] || 0}
                                    onChange={(e) => updateColLeft(c, parseInt(e.target.value) || 0)}
                                    className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-emerald-600"
                                  />
                                </div>

                                {/* Right Edge slider */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9.5px] font-mono">
                                    <span className="text-slate-400">{"Marge droite"}</span>
                                    <span className="text-emerald-600 font-bold">{(gridColRights[c] || 0) > 0 ? `+${gridColRights[c]}` : (gridColRights[c] || 0)} pts</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={gridColRights[c] || 0}
                                    onChange={(e) => updateColRight(c, parseInt(e.target.value) || 0)}
                                    className="w-full h-1 bg-slate-100 rounded cursor-pointer accent-emerald-600"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Padding Outer and Actions */}
                  <div className="border-t border-slate-100 mt-5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Outer offset padding */}
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
                          {"Marge de pourtour :"}
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="25"
                          value={gridMarginPercent}
                          onChange={(e) => setGridMarginPercent(parseInt(e.target.value) || 0)}
                          className="w-24 accent-slate-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                        />
                        <span className="text-[11px] font-mono font-bold text-slate-600">{gridMarginPercent}%</span>
                      </div>

                      {/* RESET OFFSETS BADGE */}
                      {(gridRowOffsets.some((o) => o !== 0) || gridColOffsets.some((o) => o !== 0)) && (
                        <div className="flex items-center space-x-2 bg-amber-50 text-amber-800 px-2.5 py-1 text-[10px] font-semibold rounded-lg border border-amber-200 uppercase tracking-wider font-mono">
                          <span>{"⚠️ Grille décalée"}</span>
                          <button
                            onClick={() => {
                              setGridRowOffsets(new Array(gridRows).fill(0));
                              setGridColOffsets(new Array(gridCols).fill(0));
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white rounded px-1.5 py-0.5 ml-1 transition cursor-pointer text-[9px] uppercase tracking-wide font-bold"
                            title="Remettre tous les décalages à zéro"
                          >
                            {"Réinitialiser"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                      <span className="text-[10px] text-slate-450 font-mono italic hidden sm:inline">
                        {`${gridRows * gridCols} découpes prévues`}
                      </span>
                      <button
                        onClick={handleApplyGridSlices}
                        className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-sm uppercase tracking-wide w-full sm:w-auto justify-center"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>{"Lancer la Découpe"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* OVERLAY WRAPPER CONTAINER */}
              <div
                id="workspace-container"
                ref={containerRef}
                onDragOver={onDragOver}
                onDrop={onDrop}
                className="relative bg-slate-200/50 border border-slate-250 rounded-xl overflow-hidden shadow-sm flex items-center justify-center select-none"
                style={{ minHeight: "450px" }}
              >
                {/* Visual grid behind paper */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:20px_20px] opacity-70"></div>

                {/* THE ZOOMABLE & PANNING WRAPPER STAGE */}
                <div 
                  className="relative max-w-full max-h-[75vh]"
                  style={{
                    transform: `scale(${zoomScale}) translate(${panOffset.x / zoomScale}px, ${panOffset.y / zoomScale}px)`,
                    transformOrigin: "center center",
                    transition: isPanning ? "none" : "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                    cursor: zoomScale > 1 ? (isPanning ? "grabbing" : "grab") : "default"
                  }}
                  onMouseDown={(e) => {
                    if (zoomScale > 1) {
                      const target = e.target as HTMLElement;
                      // Don't drag the view when clicking coordinates drag handles or movement areas
                      if (target && (target.id.includes("handle-") || target.id.includes("move-handle-") || target.closest(".pointer-events-auto button"))) {
                        return;
                      }
                      setIsPanning(true);
                      setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                    }
                  }}
                  onMouseMove={(e) => {
                    if (isPanning && zoomScale > 1) {
                      setPanOffset({
                        x: e.clientX - startPan.x,
                        y: e.clientY - startPan.y
                      });
                    }
                  }}
                  onMouseUp={() => setIsPanning(false)}
                  onMouseLeave={() => setIsPanning(false)}
                >
                  {/* The Image Element itself */}
                  <img
                    id="workspace-original-image"
                    ref={originalImageRef}
                    src={imageSrc}
                    alt="Planche de photos originale"
                    className="max-w-full max-h-[70vh] object-contain pointer-events-none rounded shadow-md border border-slate-300"
                    style={{ display: "block" }}
                  />

                  {/* CUSTOM WORKSPACE INTERACTION GUIDES (Double-contrast lines for light and dark images) */}
                  {gridType !== "none" && (
                    <div className="absolute inset-0 pointer-events-none z-15 border border-indigo-500/20">
                      {gridType === "thirds" && (
                        <>
                          <div className="absolute inset-y-0 left-1/3 border-r border-dashed border-white/60 after:absolute after:inset-y-0 after:left-0 after:border-r after:border-slate-800/40 after:ml-[1px]"></div>
                          <div className="absolute inset-y-0 left-2/3 border-r border-dashed border-white/60 after:absolute after:inset-y-0 after:left-0 after:border-r after:border-slate-800/40 after:ml-[1px]"></div>
                          <div className="absolute inset-x-0 top-1/3 border-b border-dashed border-white/60 after:absolute after:inset-x-0 after:top-0 after:border-b after:border-slate-800/40 after:mt-[1px]"></div>
                          <div className="absolute inset-x-0 top-2/3 border-b border-dashed border-white/60 after:absolute after:inset-x-0 after:top-0 after:border-b after:border-slate-800/40 after:mt-[1px]"></div>
                        </>
                      )}
                      {gridType === "fine" && (
                        <>
                          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                            <React.Fragment key={i}>
                              <div 
                                className="absolute inset-y-0 border-r border-dashed border-white/40 after:absolute after:inset-y-0 after:left-0 after:border-r after:border-slate-800/20 after:ml-[1px]" 
                                style={{ left: `${i * 12.5}%` }} 
                              />
                              <div 
                                className="absolute inset-x-0 border-b border-dashed border-white/40 after:absolute after:inset-x-0 after:top-0 after:border-b after:border-slate-800/20 after:mt-[1px]" 
                                style={{ top: `${i * 12.5}%` }} 
                              />
                            </React.Fragment>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* ACTIVE CROP PREVIEWS BOUNDS (RELATIVE SVG OVERLAYS) */}
                  <div className="absolute inset-0 pointer-events-auto">
                    {detections.map((det) => {
                      const [ymin, xmin, ymax, xmax] = det.box_2d;
                      
                      // Convert coordinates from relative 1000 base to relative % representation
                      const top = `${ymin / 10}%`;
                      const left = `${xmin / 10}%`;
                      const width = `${(xmax - xmin) / 10}%`;
                      const height = `${(ymax - ymin) / 10}%`;

                      const isSelected = selectedCropId === det.id;

                      return (
                        <div
                          id={`overlay-box-${det.id}`}
                          key={det.id}
                          style={{ top, left, width, height }}
                          className={`absolute border transition-shadow cursor-default group ${
                            isSelected 
                              ? "border-indigo-600 bg-indigo-650/15 ring-2 ring-indigo-500/20 shadow-md z-20" 
                              : "border-slate-400 bg-slate-900/5 hover:border-indigo-500 hover:bg-indigo-500/5 z-10 hover:shadow-xs"
                          }`}
                        >
                          {/* Label display on tag hover */}
                          <div 
                            className={`absolute top-0 left-0 -translate-y-full px-2 py-0.5 rounded-t text-[10px] font-bold text-white transition flex items-center space-x-1.5 ${
                              isSelected ? "bg-indigo-600" : "bg-slate-700 opacity-80 group-hover:opacity-100"
                            }`}
                          >
                            <span>{det.label}</span>
                          </div>

                          {/* FLOATING ACTION TOOLBAR OVER SELECTED BOX */}
                          {isSelected && (
                            <div className="absolute top-0 right-0 -translate-y-full flex items-center bg-indigo-600 rounded-t overflow-hidden border-l border-indigo-500 text-[10px] font-bold text-white z-30 shadow">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDuplicateCrop(det.id, e);
                                }}
                                className="px-2 py-1.5 hover:bg-indigo-700 transition border-r border-indigo-500/40 flex items-center space-x-1"
                                title="Cloner/Dupliquer ce cadre"
                              >
                                <Copy className="w-3.5 h-3.5 inline" />
                                <span className="hidden leading-none xs:inline">Copier</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteCrop(det.id, e);
                                }}
                                className="px-2 py-1.5 hover:bg-red-600 transition flex items-center space-x-1"
                                title="Supprimer ce cadre"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </div>
                          )}

                          {/* Invisible inner bounding box translation handle */}
                          <div
                            id={`move-handle-${det.id}`}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleWorkspaceMouseDown(det.id, "move", e.clientX, e.clientY);
                            }}
                            className="absolute inset-1.5 cursor-move"
                          />

                          {/* Custom visual corner drag handles (Visible on selection or hover) */}
                          <div className={`absolute inset-0 pointer-events-none transition opacity-0 group-hover:opacity-100 ${isSelected ? "opacity-100" : ""}`}>
                            {/* Top Left */}
                            <div
                              id={`handle-tl-${det.id}`}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleWorkspaceMouseDown(det.id, "tl", e.clientX, e.clientY);
                              }}
                              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize pointer-events-auto shadow"
                            />
                            {/* Top Right */}
                            <div
                              id={`handle-tr-${det.id}`}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleWorkspaceMouseDown(det.id, "tr", e.clientX, e.clientY);
                              }}
                              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nesw-resize pointer-events-auto shadow"
                            />
                            {/* Bottom Left */}
                            <div
                              id={`handle-bl-${det.id}`}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleWorkspaceMouseDown(det.id, "bl", e.clientX, e.clientY);
                              }}
                              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nesw-resize pointer-events-auto shadow"
                            />
                            {/* Bottom Right */}
                            <div
                              id={`handle-br-${det.id}`}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleWorkspaceMouseDown(det.id, "br", e.clientX, e.clientY);
                              }}
                              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize pointer-events-auto shadow"
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* LIVE DYNAMIC GRID SLICER PREVIEW BLOCKS */}
                    {showGridSlicer && calculateGridBoxes().map((box) => {
                      const [ymin, xmin, ymax, xmax] = box.box_2d;
                      
                      const top = `${ymin / 10}%`;
                      const left = `${xmin / 10}%`;
                      const width = `${(xmax - xmin) / 10}%`;
                      const height = `${(ymax - ymin) / 10}%`;

                      const isSelected = selectedGridCell?.row === box.row && selectedGridCell?.col === box.col;

                      return (
                        <div
                          id={box.id}
                          key={box.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGridCell({ row: box.row, col: box.col });
                          }}
                          style={{ top, left, width, height }}
                          className={`absolute border-2 z-30 cursor-pointer pointer-events-auto transition-all duration-150 rounded-xs select-none ${
                            isSelected 
                              ? "border-indigo-650 bg-indigo-500/25 ring-2 ring-indigo-400 ring-offset-1 shadow-md scale-[1.01]" 
                              : "border-dashed border-emerald-600 hover:border-indigo-500 bg-emerald-500/10 hover:bg-indigo-500/15"
                          }`}
                          title={`Cliquez pour ajuster individuellement les marges de la Case L${box.row + 1}C${box.col + 1}`}
                        >
                          <div className={`absolute top-0 left-0 text-white font-mono text-[8.5px] font-bold px-1.5 py-0.5 rounded-br shadow-sm uppercase tracking-wider ${
                            isSelected ? "bg-indigo-600 animate-pulse" : "bg-emerald-600"
                          }`}>
                            {`L${box.row + 1}C${box.col + 1}`}
                          </div>
                          
                          {/* Inner double-contrast corner guides for beautiful styling */}
                          <div className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l border-white/60"></div>
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 border-t border-r border-white/60"></div>
                          <div className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b border-l border-white/60"></div>
                          <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r border-white/60"></div>
                        </div>
                      );
                    })}

                    {/* INTERACTIVE DRAG HANDLES FOR GRID ROWS */}
                    {showGridSlicer && Array.from({ length: gridRows }).map((_, r) => {
                      const boxes = calculateGridBoxes();
                      const rowBoxes = boxes.filter((b) => b.row === r);
                      if (rowBoxes.length === 0) return null;
                      
                      const [ymin, , ymax] = rowBoxes[0].box_2d;
                      const yCenter = (ymin + ymax) / 2;
                      const topPercent = `${yCenter / 10}%`;
                      const currentOffset = gridRowOffsets[r] || 0;
                      const isActive = activeGridDrag?.type === "row" && activeGridDrag?.index === r;

                      return (
                        <div
                          key={`row-handle-${r}`}
                          style={{ top: topPercent, left: "-16px" }}
                          className="absolute z-40 -translate-y-1/2 pointer-events-auto"
                        >
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setActiveGridDrag({
                                type: "row",
                                index: r,
                                startPos: e.clientY,
                                startOffset: currentOffset,
                              });
                            }}
                            className={`flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-605 hover:bg-emerald-700 active:bg-indigo-600 text-white font-mono text-[9px] font-bold shadow-md cursor-row-resize select-none border border-white hover:scale-110 transition-all ${isActive ? "bg-indigo-600 ring-2 ring-indigo-400" : "bg-emerald-600"}`}
                            title="Glissez verticalement pour déplacer cette rangée (Ligne)"
                          >
                            <span>{`L${r + 1}`}</span>
                            <span className="text-[8px] font-sans">{"↕"}</span>
                          </div>
                          
                          <div className={`absolute left-[38px] border-t border-dashed pointer-events-none transition-all ${isActive ? "border-indigo-500 w-[5000px] z-50 opacity-100 border-2" : "border-emerald-500/40 w-[2000px] opacity-70"}`}></div>
                        </div>
                      );
                    })}

                    {/* INTERACTIVE DRAG HANDLES FOR GRID COLUMNS */}
                    {showGridSlicer && Array.from({ length: gridCols }).map((_, c) => {
                      const boxes = calculateGridBoxes();
                      const colBoxes = boxes.filter((b) => b.col === c);
                      if (colBoxes.length === 0) return null;
                      
                      const [, xmin, , xmax] = colBoxes[c % colBoxes.length].box_2d;
                      const xCenter = (xmin + xmax) / 2;
                      const leftPercent = `${xCenter / 10}%`;
                      const currentOffset = gridColOffsets[c] || 0;
                      const isActive = activeGridDrag?.type === "col" && activeGridDrag?.index === c;

                      return (
                        <div
                          key={`col-handle-${c}`}
                          style={{ left: leftPercent, top: "-16px" }}
                          className="absolute z-40 -translate-x-1/2 pointer-events-auto"
                        >
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setActiveGridDrag({
                                type: "col",
                                index: c,
                                startPos: e.clientX,
                                startOffset: currentOffset,
                              });
                            }}
                            className={`flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-605 hover:bg-emerald-700 active:bg-indigo-600 text-white font-mono text-[9px] font-bold shadow-md cursor-col-resize select-none border border-white hover:scale-110 transition-all ${isActive ? "bg-indigo-600 ring-2 ring-indigo-400" : "bg-emerald-600"}`}
                            title="Glissez horizontalement pour déplacer cette colonne"
                          >
                            <span>{`C${c + 1}`}</span>
                            <span className="text-[8px] font-sans">{"↔"}</span>
                          </div>

                          <div className={`absolute top-[38px] border-l border-dashed pointer-events-none transition-all ${isActive ? "border-indigo-500 h-[5000px] z-50 opacity-100 border-2" : "border-emerald-500/40 h-[2000px] opacity-70"}`}></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* HELPFUL QUICK STATS */}
              <div className="mt-4 p-3.5 bg-white border border-slate-200 rounded-xl flex items-center space-x-3 text-xs text-slate-550 shadow-xs text-left">
                <Info className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span>
                  {detections.length === 0 
                    ? "Aucun cadre détecté. Cliquez sur 'Détecter les photos' dans la barre d'outils supérieure pour lancer l'IA."
                    : `${detections.length} clichés repérés. Ajustez la taille d'un cliché en faisant glisser ses coins.`
                  }
                </span>
              </div>
            </div>

            {/* RIGHT WORKSPACE: SETTINGS & PARAMETERS (40%) */}
            <div className="lg:col-span-12 xl:col-span-4 flex flex-col gap-4">
              
              {/* CORE PARAMS AND CONTROL MODES CARD */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-xs text-left space-y-4">
                <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-100">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-750 uppercase tracking-wide font-sans">
                    {"⚙️ Réglages & Outils de Précision"}
                  </h3>
                </div>
                
                <div className="text-[11.5px] text-slate-500 leading-normal bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                  {showGridSlicer ? (
                    <p>
                      <strong>{"Mode Grille Actif :"}</strong> {"Ajustez le nombre de rangées et de colonnes ci-dessous. Faites glisser les étiquettes "} <span className="font-semibold text-emerald-600 font-mono font-bold">{"L1, C1..."}</span> {"directement sur l'image de gauche pour aligner la grille."}
                    </p>
                  ) : (
                    <p>
                      <strong>{"Mode Manuel / IA Actif :"}</strong> {"Dessinez vos propres cadres directement sur l'image à gauche ou cliquez sur "} <strong>{"\"Détecter IA ✨\""}</strong> {"en haut pour lancer le découpage automatique."}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowGridSlicer(!showGridSlicer)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold border transition flex items-center justify-center space-x-1 ${
                      showGridSlicer
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-2xs"
                        : "bg-white hover:bg-slate-50 border-slate-250 text-slate-650"
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>Grille : {showGridSlicer ? "ACTIVÉE" : "DESACTIVÉE"}</span>
                  </button>
                  <button
                    onClick={handleAddManualFrame}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-650 text-[10.5px] font-bold border border-slate-255 transition flex items-center justify-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0 text-indigo-650" />
                    <span>Cadre Manuel</span>
                  </button>
                </div>
              </div>
              
              {/* COMPACT INTUITIVE GRID SLICER PANEL */}
              {imageSrc && showGridSlicer && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-xs text-left space-y-4 animate-fade-in">
                  <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-100">
                    <Grid className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider font-sans">
                      {"Découpe en Grille"}
                    </h4>
                  </div>

                  <div className="space-y-4">
                    {/* Rows */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">
                          Lignes (Rangées)
                        </span>
                        <span className="text-xs font-mono font-extrabold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded border border-slate-205">
                          {gridRows}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={gridRows}
                          onChange={(e) => setGridRows(parseInt(e.target.value) || 1)}
                          className="w-full accent-emerald-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                        />
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={gridRows}
                          onChange={(e) => setGridRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                          className="w-12 text-center text-xs font-bold font-mono border border-slate-205 rounded px-1.5 py-1 bg-slate-50"
                        />
                      </div>
                    </div>

                    {/* Columns */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">
                          Colonnes
                        </span>
                        <span className="text-xs font-mono font-extrabold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded border border-slate-205">
                          {gridCols}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={gridCols}
                          onChange={(e) => setGridCols(parseInt(e.target.value) || 1)}
                          className="w-full accent-emerald-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                        />
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={gridCols}
                          onChange={(e) => setGridCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                          className="w-12 text-center text-xs font-bold font-mono border border-slate-205 rounded px-1.5 py-1 bg-slate-50"
                        />
                      </div>
                    </div>

                    {/* Width / Height Factors */}
                    <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-slate-105">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono block mb-1">
                          % Largeur cadre
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={gridWidthPercent}
                            onChange={(e) => setGridWidthPercent(parseInt(e.target.value) || 90)}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded"
                          />
                          <span className="text-[10px] font-bold font-mono text-indigo-700">{gridWidthPercent}%</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono block mb-1">
                          % Hauteur cadre
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={gridHeightPercent}
                            onChange={(e) => setGridHeightPercent(parseInt(e.target.value) || 90)}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded"
                          />
                          <span className="text-[10px] font-bold font-mono text-indigo-700">{gridHeightPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Margins */}
                    <div className="pt-2 border-t border-slate-105">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">
                          Marge de pourtour
                        </span>
                        <span className="text-xs font-bold font-mono text-slate-700 bg-emerald-50 px-2 py-0.5 border border-emerald-150 rounded">{gridMarginPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        value={gridMarginPercent}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setGridMarginPercent(val);
                          setGridRowTops(Array(gridRows).fill(val));
                          setGridRowBottoms(Array(gridRows).fill(val));
                          setGridColLefts(Array(gridCols).fill(val));
                          setGridColRights(Array(gridCols).fill(val));
                        }}
                        className="w-full h-1 accent-emerald-600 bg-slate-100 rounded"
                      />
                    </div>
                  </div>

                  {/* Trigger action */}
                  <div className="pt-2">
                    <button
                      onClick={handleApplyGridSlices}
                      className="w-full py-2.5 bg-emerald-605 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-sm uppercase tracking-wide cursor-pointer"
                    >
                      <Scissors className="w-4 h-4" />
                      <span>{"Lancer la Découpe"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CLOUDINARY CLOUD STORAGE INTEGRATION & PERSISTENCE PANEL */}
              <div className="p-4.5 bg-white border border-slate-205 rounded-2xl space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Cloud className={`w-4 h-4 ${cloudinaryCloudName && cloudinaryUploadPreset ? "text-indigo-600 animate-pulse" : "text-slate-400"}`} />
                      <span className="text-xs font-black text-slate-705 uppercase tracking-wide font-sans">
                        {"Sauvegarde Cloudinary Cloud"}
                      </span>
                    </div>
                    <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-full ${
                      cloudinaryCloudName && cloudinaryUploadPreset 
                        ? "bg-indigo-100 text-indigo-805 border border-indigo-200" 
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}>
                      {cloudinaryCloudName && cloudinaryUploadPreset ? "CONFIGURÉ" : "REQUIS"}
                    </span>
                  </div>

                  {/* Config settings inputs form */}
                  <div className="space-y-3 bg-white p-3.5 border border-slate-150 rounded-xl">
                    <h5 className="text-[10px] font-black text-indigo-850 font-mono uppercase tracking-wider">
                      {"⚙ Paramètres Cloudinary Directs"}
                    </h5>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                          {"Cloud Name :"}
                        </label>
                        <input
                          type="text"
                          value={cloudinaryCloudName}
                          onChange={(e) => handleSaveCloudinaryConfig(e.target.value, cloudinaryUploadPreset, cloudinaryFolder)}
                          className="w-full text-xs font-semibold font-mono border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 outline-hidden focus:border-indigo-400 focus:bg-white"
                          placeholder="Ex: demo"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                          {"Upload Preset (Non-signé) :"}
                        </label>
                        <input
                          type="text"
                          value={cloudinaryUploadPreset}
                          placeholder="Ex: preset_off"
                          onChange={(e) => handleSaveCloudinaryConfig(cloudinaryCloudName, e.target.value, cloudinaryFolder)}
                          className="w-full text-xs font-semibold font-mono border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 outline-hidden focus:border-indigo-400 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <label className="text-[9.5px] font-bold text-slate-400 font-mono uppercase tracking-wider flex justify-between">
                        <span>{"Dossier de stockage :"}</span>
                        <span className="text-[8.5px] font-normal text-slate-350 italic">{"Optionnel"}</span>
                      </label>
                      <input
                        type="text"
                        value={cloudinaryFolder}
                        placeholder="Ex: photo_cutter_crops"
                        onChange={(e) => handleSaveCloudinaryConfig(cloudinaryCloudName, cloudinaryUploadPreset, e.target.value)}
                        className="w-full text-xs font-semibold font-mono border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 outline-hidden focus:border-indigo-400 focus:bg-white"
                      />
                    </div>

                    <div className="pt-1.5 border-t border-slate-100 flex items-start space-x-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-[9px] text-slate-400 leading-normal">
                        {"Pour configurer un envoi client direct : allez dans vos paramètres Cloudinary > Upload, ajoutez un "}
                        <span className="font-bold underline text-slate-500">{"Upload Preset"}</span>
                        {" en mode "}
                        <span className="font-bold underline text-slate-500">{"Unsigned (non signé)"}</span>
                        {". Vos credentials restent stockés localement sur votre navigateur."}
                      </p>
                    </div>
                  </div>

                  {/* ACTIONS UPLOAD BUTTON */}
                  {croppedPhotos.length > 0 && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleUploadAllToCloudinary}
                        disabled={isUploadingToCloudinary || !cloudinaryCloudName || !cloudinaryUploadPreset}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl shadow-xs transition uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer"
                      >
                        {isUploadingToCloudinary ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Cloud className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isUploadingToCloudinary ? "Téléversement en cours..." : `Héberger les ${croppedPhotos.length} clichés sur Cloudinary`}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* PROGRESS & ERRORS */}
                  {cloudinaryProgress && (
                    <div className="p-2.5 bg-indigo-50 text-indigo-850 text-xs font-semibold rounded-lg border border-indigo-150 leading-relaxed animate-pulse">
                      {cloudinaryProgress}
                    </div>
                  )}
                  {cloudinaryError && (
                    <div className="p-2.5 bg-rose-50 text-rose-800 text-xs font-semibold rounded-lg border border-rose-150 leading-relaxed">
                      {cloudinaryError}
                    </div>
                  )}

                  {/* CLOUD HOSTED ARCHIVE HISTORY */}
                  {cloudinaryUploadedUrls.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black font-sans text-slate-500 uppercase tracking-wider">
                          {`📎 Liens hébergés (${cloudinaryUploadedUrls.length})`}
                        </span>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              const allLinks = cloudinaryUploadedUrls.map(f => f.secureUrl).join("\n");
                              navigator.clipboard.writeText(allLinks);
                              setCloudinaryProgress("📋 Tous les liens HTTPS ont été copiés dans le presse-papiers !");
                              setTimeout(() => setCloudinaryProgress(null), 3000);
                            }}
                            className="text-[9px] font-black font-mono text-indigo-600 hover:text-indigo-805 underline uppercase cursor-pointer"
                          >
                            {"Copier tout"}
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => {
                              setCloudinaryUploadedUrls([]);
                              if (typeof window !== "undefined") {
                                localStorage.removeItem("cloudinary_uploaded_history");
                              }
                            }}
                            className="text-[9px] font-black font-mono text-rose-600 hover:text-rose-800 underline uppercase cursor-pointer"
                          >
                            {"Vider"}
                          </button>
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                        {cloudinaryUploadedUrls.map((cloudItem, cIdx) => (
                          <div key={`cloud-item-${cloudItem.id}-${cIdx}`} className="flex items-center justify-between py-1.5 text-xs">
                            <div className="flex items-center space-x-2 overflow-hidden mr-2">
                              {/* Thumbnail preview */}
                              <div className="w-7 h-7 relative bg-slate-100 rounded border border-slate-205 overflow-hidden shrink-0">
                                <img
                                  src={cloudItem.secureUrl}
                                  alt={cloudItem.label}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-700 truncate text-[10px]" title={cloudItem.label}>
                                  {cloudItem.label}
                                </p>
                                <span className="font-mono text-[8.5px] text-slate-400 block truncate">
                                  {`${cloudItem.format.toUpperCase()} • ${(cloudItem.bytes / 1024).toFixed(1)} Ko • ${cloudItem.width}x${cloudItem.height}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-1 shrink-0">
                              {/* Open link */}
                              <a
                                href={cloudItem.secureUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-1.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 rounded transition"
                                title="Ouvrir l'image en pleine définition"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </a>
                              
                              {/* Copy secure link */}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(cloudItem.secureUrl);
                                  setCloudinaryProgress(`📋 Lien copié pour ${cloudItem.label} !`);
                                  setTimeout(() => setCloudinaryProgress(null), 2500);
                                }}
                                className="px-1.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-indigo-600 hover:text-indigo-805 rounded transition"
                                title="Copier l'URL sécurisée"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

            </div>

          </div>

          {/* BOTTOM SECTION: GALLERY CONTAINER AND CROPPED CLICHÉS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 text-left">
            
            {/* GALLERY ACTIONS HEADER BAR */}
            <div className="pb-4 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 font-sans flex items-center space-x-2">
                  <Scissors className="w-4 h-4 text-indigo-650" />
                  <span>{"Photos Découpées / Galerie"}</span>
                </h3>
                <p className="text-xs text-slate-450 font-bold font-mono mt-0.5">
                  {croppedPhotos.length} clichés prêts à être exportés ou hébergés
                </p>
              </div>

              {croppedPhotos.length > 0 && (
                <button
                  id="btn-download-all"
                  onClick={handleDownloadAll}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0 cursor-pointer"
                  title="Télécharger toutes les images recadrées d'un coup"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Télécharger Tout ({croppedPhotos.length})</span>
                </button>
              )}
            </div>

            {/* DYNAMIC PROGRESS INJECTOR BLOCK FOR PROCESSING */}
            {loading && (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center text-center space-y-4 shadow-xs">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                <p className="text-xs font-bold text-slate-700">{loadingStep || "Découpe en cours par l'IA..."}</p>
                <div className="w-full bg-slate-200 rounded-full h-1 max-w-[200px] overflow-hidden">
                  <div className="bg-indigo-600 h-full animate-pulse" style={{ width: "65%" }}></div>
                </div>
              </div>
            )}

            {croppedPhotos.length === 0 && !loading ? (
              <div className="h-[40vh] flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <div className="bg-slate-100 p-3.5 rounded-xl text-slate-400 mb-3 border border-slate-150 shadow-inner">
                  <Scissors className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Votre galerie est vide</h4>
                <p className="text-xs text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                  {"Cliquez sur le bouton « Détecter IA ✨ » en haut à droite pour rechercher et détourer automatiquement tous les clichés présents sur cette planche."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {croppedPhotos.map((photo) => {
                      const det = detections.find((d) => d.id === photo.id) || photo.detection;
                      const isFilterOpen = activeFilterTab === photo.id;

                      return (
                        <div
                          id={`photo-card-${photo.id}`}
                          key={photo.id}
                          className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl overflow-hidden shadow-xs flex flex-col transition group"
                        >
                          {/* Image Box */}
                          <div className="relative aspect-video bg-slate-50 border-b border-slate-150 flex items-center justify-center p-2 group-hover:bg-slate-100/60 transition">
                            <img
                              src={photo.croppedSrc}
                              alt={photo.label}
                              className="max-h-full max-w-full object-contain rounded border border-slate-200/60 shadow-xs"
                              style={{ display: "block" }}
                            />
                            
                            {/* Rotation Quick Action overlay */}
                            <button
                              id={`card-rotate-shortcut-${photo.id}`}
                              onClick={() => {
                                  const nextRotation = (det.rotation + 90) % 360;
                                  updateDetectionField(photo.id, "rotation", nextRotation);
                              }}
                              className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-indigo-600 rounded-md text-white opacity-0 group-hover:opacity-100 transition shadow"
                              title="Pivoter de 90°"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Card details */}
                          <div className="p-3 flex-1 flex flex-col">
                            {/* Card Header with Source Type Badge */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                                Cliché {croppedPhotos.indexOf(photo) + 1}
                              </span>
                              {det.id.includes("manual") ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  👤 Manuel
                                </span>
                              ) : det.customized ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200" title="Vous avez personnalisé le nom de ce cliché">
                                  ✏️ Personnalisé
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-150 animate-pulse" title="Nom intelligent généré par l'IA d'après le contenu du cliché">
                                  ✨ IA : Nom Détecté
                                </span>
                              )}
                            </div>

                            {/* Title Label Input */}
                            <input
                              id={`input-label-${photo.id}`}
                              type="text"
                              value={photo.label}
                              onChange={(e) => updateDetectionField(photo.id, "label", e.target.value)}
                              className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-slate-100 border border-transparent focus:border-slate-250 text-xs font-bold text-slate-800 px-2.5 py-1.5 rounded-lg transition mb-1.5"
                              placeholder="Nommer ce cliché..."
                            />

                            {/* Filename Preview */}
                            {(() => {
                              const sanitizedTitleForFilename = (photo.label || "")
                                .toLowerCase()
                                .trim()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .replace(/[^a-z0-9_-]/g, "_")
                                .replace(/_+/g, "_");
                              const finalDownloadFilename = `${sanitizedTitleForFilename || "photo"}.jpg`;
                              return (
                                <p className="text-[10px] text-slate-400 font-mono flex items-center space-x-1 mb-3 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md overflow-hidden text-ellipsis whitespace-nowrap" title={`Téléchargera sous : ${finalDownloadFilename}`}>
                                  <span className="font-semibold text-slate-500 uppercase tracking-widest text-[8px] mr-1 shrink-0">Fichier:</span>
                                  <span className="truncate">{finalDownloadFilename}</span>
                                </p>
                              );
                            })()}

                            {/* Filters Tray Toggle */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                              <div className="flex items-center space-x-1.5">
                                {/* Toggle Filters option */}
                                <button
                                  id={`btn-toggle-filters-${photo.id}`}
                                  onClick={() => setActiveFilterTab(isFilterOpen ? null : photo.id)}
                                  className={`px-2 py-1 rounded text-xs transition inline-flex items-center space-x-1 border ${
                                    isFilterOpen || det.grayscale || det.sepia || det.brightness !== 100 || det.contrast !== 100
                                      ? "bg-indigo-50 border-indigo-150 text-indigo-700 font-bold" 
                                      : "text-slate-500 border-slate-100 hover:bg-slate-50 hover:text-slate-800"
                                  }`}
                                  title="Ajuster les filtres d'image IA"
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold font-mono">Filtres</span>
                                </button>
                              </div>

                              {/* Action Items */}
                              <div className="flex items-center space-x-1.5">
                                <button
                                  id={`btn-duplicate-card-${photo.id}`}
                                  onClick={(e) => handleDuplicateCrop(photo.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                  title="Dupliquer ce cadre (clonage rapide)"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  id={`btn-delete-${photo.id}`}
                                  onClick={(e) => handleDeleteCrop(photo.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                  title="Supprimer ce cliché"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                
                                <button
                                  id={`btn-download-${photo.id}`}
                                  onClick={() => handleDownloadSingle(photo)}
                                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-150 text-[11px] font-bold rounded-lg text-indigo-600 transition border border-slate-200"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Enregistrer</span>
                                </button>
                              </div>
                            </div>

                            {/* FILTERS PANEL DRAWER */}
                            {isFilterOpen && (
                              <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-4 shadow-xs text-left animate-slide-down">
                                
                                {/* Brightness */}
                                <div>
                                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                                    <span>Luminosité</span>
                                    <span className="text-indigo-650 font-bold font-mono">{det.brightness}%</span>
                                  </div>
                                  <input
                                    id={`slider-brightness-${photo.id}`}
                                    type="range"
                                    min="40"
                                    max="180"
                                    value={det.brightness}
                                    onChange={(e) => updateDetectionField(photo.id, "brightness", parseInt(e.target.value))}
                                    className="w-full accent-indigo-600 bg-slate-200 h-1 rounded cursor-pointer"
                                  />
                                </div>

                                {/* Contrast */}
                                <div>
                                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                                    <span>Contraste</span>
                                    <span className="text-indigo-650 font-bold font-mono">{det.contrast}%</span>
                                  </div>
                                  <input
                                    id={`slider-contrast-${photo.id}`}
                                    type="range"
                                    min="40"
                                    max="180"
                                    value={det.contrast}
                                    onChange={(e) => updateDetectionField(photo.id, "contrast", parseInt(e.target.value))}
                                    className="w-full accent-indigo-600 bg-slate-200 h-1 rounded cursor-pointer"
                                  />
                                </div>

                                {/* Tone Presets buttons */}
                                <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
                                  {/* Grayscale Toggle */}
                                  <button
                                    id={`btn-filter-grayscale-${photo.id}`}
                                    onClick={() => updateDetectionField(photo.id, "grayscale", !det.grayscale)}
                                    className={`px-2 py-1.5 border rounded text-[10px] font-bold transition ${
                                      det.grayscale 
                                        ? "bg-indigo-600 text-white border-indigo-600" 
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                    }`}
                                  >
                                    Noir & Blanc
                                  </button>

                                  {/* Sepia Toggle */}
                                  <button
                                    id={`btn-filter-sepia-${photo.id}`}
                                    onClick={() => updateDetectionField(photo.id, "sepia", !det.sepia)}
                                    className={`px-2 py-1.5 border rounded text-[10px] font-bold transition ${
                                      det.sepia 
                                        ? "bg-indigo-600 text-white border-indigo-600" 
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                    }`}
                                  >
                                    Effet Sépia (Rétro)
                                  </button>
                                </div>
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            </div>
        )}

      </div>

      {/* GLOBAL APPLICATION ALERTS */}
      {error && (
        <div id="app-error-alert" className="fixed bottom-6 right-6 border border-red-200 bg-white text-slate-800 px-4 py-3.5 rounded-xl shadow-2xl backdrop-blur flex items-center space-x-3 z-50 animate-bounce">
          <X className="w-5 h-5 text-red-500 flex-shrink-0 cursor-pointer" onClick={() => setError(null)} />
          <div className="text-left text-xs">
            <p className="font-bold text-red-650">Une erreur est survenue</p>
            <p className="text-slate-500 mt-0.5 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* GOOGLE PICKER SETUP INSTRUCTIONAL MODAL */}
      {googleConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative overflow-hidden flex flex-col">
            <button
              onClick={() => setGoogleConfigModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start space-x-4 mb-4">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 flex-shrink-0">
                <Cloud className="w-6 h-6 stroke-[1.8]" />
              </div>
              <div className="text-left">
                <h3 className="font-extrabold text-slate-900 text-lg font-display">💡 Activer Google Drive Picker</h3>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  {"L'application utilise l'API Google Picker sécurisée pour vous donner accès à vos planches ou photos directement depuis votre Google Drive."}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4.5 text-left text-xs text-slate-600 space-y-3 font-medium">
              <p className="font-semibold text-slate-800">Pour connecter votre compte Drive, suivez ces étapes :</p>
              <ol className="list-decimal pl-4.5 space-y-2 leading-relaxed font-sans">
                <li>
                  {"Rendez-vous sur la "}
                  <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">Google Cloud Console</a>.
                </li>
                <li>
                  {"Activez l'API "}<strong>Google Picker API</strong>{" et l'API "}<strong>Google Drive API</strong>{" pour votre projet."}
                </li>
                <li>
                  {"Sous "}<strong>Identifiants</strong>{", créez un "}<strong>ID client OAuth</strong>{" (de type "}<em>Application Web</em>{") et ajoutez "}<code className="bg-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px] break-all select-all text-slate-800">{typeof window !== "undefined" ? window.location.origin : "votre URL d'application"}</code>{" dans la section "}<em>Origines JavaScript autorisées</em>{"."}
                </li>
                <li>
                  {"Dans cette interface d'AI Studio, cliquez sur le menu "}<strong>Settings</strong>{" puis "}<strong>Secrets</strong>{" en haut à droite."}
                </li>
                <li>
                  {"Saisissez la clé "}<strong>NEXT_PUBLIC_GOOGLE_CLIENT_ID</strong>{" avec la valeur de votre ID client OAuth, et enregistrez-la pour connecter votre Drive de manière transparente !"}
                </li>
              </ol>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setGoogleConfigModal(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer shadow-md"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
