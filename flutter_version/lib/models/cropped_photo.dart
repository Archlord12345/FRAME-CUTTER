import 'dart:typed_data';
import 'detection.dart';

class CroppedPhoto {
  final String id;
  final String label;
  final Uint8List bytes;
  final Detection detection;

  CroppedPhoto({
    required this.id,
    required this.label,
    required this.bytes,
    required this.detection,
  });
}
