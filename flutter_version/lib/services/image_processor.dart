import 'dart:typed_data';
import 'package:image/image.dart' as img;
import '../models/detection.dart';
import '../models/cropped_photo.dart';

class ImageProcessor {
  Future<CroppedPhoto> extractPhoto(Uint8List sourceBytes, Detection det) async {
    final image = img.decodeImage(sourceBytes);
    if (image == null) throw Exception("Impossible de décoder l'image source");

    final natW = image.width;
    final natH = image.height;

    // Convert relative coordinates (0-1000) to absolute pixels
    final ymin = (det.box2d[0] / 1000) * natH;
    final xmin = (det.box2d[1] / 1000) * natW;
    final ymax = (det.box2d[2] / 1000) * natH;
    final xmax = (det.box2d[3] / 1000) * natW;

    int cropX = xmin.round();
    int cropY = ymin.round();
    int cropW = (xmax - xmin).round();
    int cropH = (ymax - ymin).round();

    // Clamp values
    cropX = cropX.clamp(0, natW - 1);
    cropY = cropY.clamp(0, natH - 1);
    cropW = cropW.clamp(1, natW - cropX);
    cropH = cropH.clamp(1, natH - cropY);

    var cropped = img.copyCrop(image, x: cropX, y: cropY, width: cropW, height: cropH);

    // Apply rotation
    if (det.rotation != 0) {
      cropped = img.copyRotate(cropped, angle: det.rotation);
    }

    // Apply filters
    if (det.brightness != 1.0 || det.contrast != 1.0) {
      cropped = img.adjustColor(
        cropped,
        brightness: det.brightness,
        contrast: det.contrast,
      );
    }

    if (det.grayscale) {
      cropped = img.grayscale(cropped);
    }

    if (det.sepia) {
      cropped = img.sepia(cropped);
    }

    final outputBytes = Uint8List.fromList(img.encodeJpg(cropped, quality: 95));

    return CroppedPhoto(
      id: det.id,
      label: det.label,
      bytes: outputBytes,
      detection: det,
    );
  }
}
