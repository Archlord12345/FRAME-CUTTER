import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/detection.dart';
import '../models/cropped_photo.dart';
import '../services/gemini_service.dart';
import '../services/image_processor.dart';
import '../services/cloudinary_service.dart';

class AppProvider extends ChangeNotifier {
  Uint8List? _sourceImage;
  String? _mimeType;
  List<Detection> _detections = [];
  List<CroppedPhoto> _croppedPhotos = [];
  bool _isLoading = false;
  String _loadingStep = "";
  String? _error;

  double _zoomScale = 1.0;
  Offset _panOffset = Offset.zero;

  // Cloudinary Config
  String _cloudinaryCloudName = "";
  String _cloudinaryUploadPreset = "";
  String _cloudinaryFolder = "photo_cutter_crops";

  final ImageProcessor _imageProcessor = ImageProcessor();
  final CloudinaryService _cloudinaryService = CloudinaryService();

  AppProvider() {
    _loadSettings();
  }

  // Getters
  Uint8List? get sourceImage => _sourceImage;
  List<Detection> get detections => _detections;
  List<CroppedPhoto> get croppedPhotos => _croppedPhotos;
  bool get isLoading => _isLoading;
  String get loadingStep => _loadingStep;
  String? get error => _error;
  double get zoomScale => _zoomScale;
  Offset get panOffset => _panOffset;
  String get cloudinaryCloudName => _cloudinaryCloudName;
  String get cloudinaryUploadPreset => _cloudinaryUploadPreset;
  String get cloudinaryFolder => _cloudinaryFolder;

  void setSourceImage(Uint8List bytes, String mimeType) {
    _sourceImage = bytes;
    _mimeType = mimeType;
    _detections = [];
    _croppedPhotos = [];
    _zoomScale = 1.0;
    _panOffset = Offset.zero;
    notifyListeners();
  }

  Future<void> detectPhotos(String apiKey) async {
    if (_sourceImage == null) return;
    _setLoading(true, "L'IA analyse la planche...");
    _error = null;

    try {
      final gemini = GeminiService(apiKey);
      final results = await gemini.detectPhotos(_sourceImage!, _mimeType ?? "image/jpeg");
      _detections = results;
      _setLoading(true, "Génération des vignettes...");
      await _processAllCrops();
    } catch (e) {
      _error = e.toString();
    } finally {
      _setLoading(false, "");
    }
  }

  Future<void> _processAllCrops() async {
    List<CroppedPhoto> results = [];
    for (var det in _detections) {
      final crop = await _imageProcessor.extractPhoto(_sourceImage!, det);
      results.add(crop);
    }
    _croppedPhotos = results;
    notifyListeners();
  }

  Future<void> updateDetectionField(String id, {String? label, int? rotation, double? brightness, double? contrast, bool? grayscale, bool? sepia}) async {
    final index = _detections.indexWhere((d) => d.id == id);
    if (index == -1) return;

    var det = _detections[index];
    det = det.copyWith(
      label: label,
      rotation: rotation,
      brightness: brightness,
      contrast: contrast,
      grayscale: grayscale,
      sepia: sepia,
      customized: label != null,
    );
    _detections[index] = det;

    // Reprocess single photo
    final crop = await _imageProcessor.extractPhoto(_sourceImage!, det);
    final cropIndex = _croppedPhotos.indexWhere((p) => p.id == id);
    if (cropIndex != -1) {
      _croppedPhotos[cropIndex] = crop;
    }
    notifyListeners();
  }

  void addManualFrame() async {
    if (_sourceImage == null) return;
    final id = 'manual-${DateTime.now().millisecondsSinceEpoch}';
    final det = Detection(
      id: id,
      box2d: [250, 250, 750, 750],
      label: "Cadre Manuel",
      suggestedFilename: "cadre_manuel",
      customized: true,
    );
    _detections.add(det);
    final crop = await _imageProcessor.extractPhoto(_sourceImage!, det);
    _croppedPhotos.add(crop);
    notifyListeners();
  }

  void deleteCrop(String id) {
    _detections.removeWhere((d) => d.id == id);
    _croppedPhotos.removeWhere((p) => p.id == id);
    notifyListeners();
  }

  void reset() {
    _sourceImage = null;
    _detections = [];
    _croppedPhotos = [];
    _error = null;
    notifyListeners();
  }

  void setZoom(double scale) {
    _zoomScale = scale;
    if (_zoomScale == 1.0) _panOffset = Offset.zero;
    notifyListeners();
  }

  void setPan(Offset offset) {
    _panOffset = offset;
    notifyListeners();
  }

  void _setLoading(bool loading, String step) {
    _isLoading = loading;
    _loadingStep = step;
    notifyListeners();
  }

  // Cloudinary Settings
  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    _cloudinaryCloudName = prefs.getString('cloudinary_cloud_name') ?? "";
    _cloudinaryUploadPreset = prefs.getString('cloudinary_upload_preset') ?? "";
    _cloudinaryFolder = prefs.getString('cloudinary_folder') ?? "photo_cutter_crops";
    notifyListeners();
  }

  Future<void> saveCloudinaryConfig(String name, String preset, String folder) async {
    _cloudinaryCloudName = name;
    _cloudinaryUploadPreset = preset;
    _cloudinaryFolder = folder;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('cloudinary_cloud_name', name);
    await prefs.setString('cloudinary_upload_preset', preset);
    await prefs.setString('cloudinary_folder', folder);
    notifyListeners();
  }

  Future<void> uploadAllToCloudinary() async {
    if (_croppedPhotos.isEmpty) return;
    _setLoading(true, "Envoi vers Cloudinary...");
    try {
      for (var photo in _croppedPhotos) {
        await _cloudinaryService.uploadImage(
          bytes: photo.bytes,
          cloudName: _cloudinaryCloudName,
          uploadPreset: _cloudinaryUploadPreset,
          folder: _cloudinaryFolder,
          publicId: photo.detection.suggestedFilename,
        );
      }
    } catch (e) {
      _error = "Upload failed: ${e.toString()}";
    } finally {
      _setLoading(false, "");
    }
  }

  void applyGrid(int rows, int cols, double margin, double widthFactor, double heightFactor) async {
     if (_sourceImage == null) return;
    _setLoading(true, "Génération de la grille...");

    final List<Detection> newDetections = [];

    double p = margin.clamp(0, 45);
    double yminActive = p * 10;
    double ymaxActive = 1000 - p * 10;
    double xminActive = p * 10;
    double xmaxActive = 1000 - p * 10;

    double hActive = ymaxActive - yminActive;
    double wActive = xmaxActive - xminActive;

    double cellH = hActive / rows;
    double cellW = wActive / cols;

    for (int r = 0; r < rows; r++) {
      double cellTop = yminActive + r * cellH;
      double frameH = cellH * heightFactor;
      double yminFrame = cellTop + (cellH - frameH) / 2;
      double ymaxFrame = yminFrame + frameH;

      for (int c = 0; c < cols; c++) {
        double cellLeft = xminActive + c * cellW;
        double frameW = cellW * widthFactor;
        double xminFrame = cellLeft + (cellW - frameW) / 2;
        double xmaxFrame = xminFrame + frameW;

        final id = 'grid-$r-$c-${DateTime.now().millisecondsSinceEpoch}';
        newDetections.add(Detection(
          id: id,
          box2d: [yminFrame.round(), xminFrame.round(), ymaxFrame.round(), xmaxFrame.round()],
          label: "Cliché Grille R${r+1} C${c+1}",
          suggestedFilename: "photo_grille_${r+1}_${c+1}",
          customized: true,
        ));
      }
    }

    _detections = newDetections;
    await _processAllCrops();
    _setLoading(false, "");
  }
}
