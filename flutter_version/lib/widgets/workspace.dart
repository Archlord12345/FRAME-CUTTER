import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../models/detection.dart';

class Workspace extends StatefulWidget {
  const Workspace({super.key});

  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  final GlobalKey _imageKey = GlobalKey();

  Size _getImageDisplaySize(BoxConstraints constraints, Size imageSize) {
    double scale = (constraints.maxWidth / imageSize.width).clamp(0, constraints.maxHeight / imageSize.height);
    return Size(imageSize.width * scale, imageSize.height * scale);
  }

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();
    if (appProvider.sourceImage == null) return const Center(child: Text("Aucune image chargée"));

    return LayoutBuilder(
      builder: (context, constraints) {
        return GestureDetector(
          onScaleUpdate: (details) {
            if (details.pointerCount == 2) {
              appProvider.setZoom((appProvider.zoomScale * details.scale).clamp(1.0, 4.0));
            } else if (appProvider.zoomScale > 1.0) {
              appProvider.setPan(appProvider.panOffset + details.focalPointDelta);
            }
          },
          child: Container(
            color: Colors.grey.shade200,
            child: ClipRect(
              child: Transform(
                transform: Matrix4.identity()
                  ..translate(appProvider.panOffset.dx, appProvider.panOffset.dy)
                  ..scale(appProvider.zoomScale),
                alignment: Alignment.center,
                child: Center(
                  child: FutureBuilder<Size>(
                    future: _calculateImageSize(appProvider.sourceImage!),
                    builder: (context, snapshot) {
                      if (!snapshot.hasData) return const CircularProgressIndicator();
                      final imageSize = snapshot.data!;
                      final displaySize = _getImageDisplaySize(constraints, imageSize);

                      return SizedBox(
                        width: displaySize.width,
                        height: displaySize.height,
                        child: Stack(
                          children: [
                            Image.memory(
                              appProvider.sourceImage!,
                              key: _imageKey,
                              fit: BoxFit.fill,
                            ),
                            ...appProvider.detections.map((det) => _buildDetectionOverlay(det, appProvider, displaySize)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<Size> _calculateImageSize(Uint8List bytes) {
    final completer = Completer<Size>();
    final image = Image.memory(bytes);
    image.image.resolve(const ImageConfiguration()).addListener(
      ImageStreamListener((ImageInfo info, bool _) {
        completer.complete(Size(info.image.width.toDouble(), info.image.height.toDouble()));
      }),
    );
    return completer.future;
  }

  Widget _buildDetectionOverlay(Detection det, AppProvider appProvider, Size displaySize) {
    final left = (det.box2d[1] / 1000) * displaySize.width;
    final top = (det.box2d[0] / 1000) * displaySize.height;
    final width = ((det.box2d[3] - det.box2d[1]) / 1000) * displaySize.width;
    final height = ((det.box2d[2] - det.box2d[0]) / 1000) * displaySize.height;

    return Positioned(
      left: left,
      top: top,
      width: width,
      height: height,
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: Colors.indigo, width: 2),
          color: Colors.indigo.withOpacity(0.1),
        ),
        child: Stack(
          children: [
            _buildHandle(Alignment.topLeft, det, appProvider),
            _buildHandle(Alignment.topRight, det, appProvider),
            _buildHandle(Alignment.bottomLeft, det, appProvider),
            _buildHandle(Alignment.bottomRight, det, appProvider),
          ],
        ),
      ),
    );
  }

  Widget _buildHandle(Alignment alignment, Detection det, AppProvider appProvider) {
    return Align(
      alignment: alignment,
      child: Container(
        width: 10,
        height: 10,
        decoration: const BoxDecoration(color: Colors.indigo, shape: BoxShape.circle),
      ),
    );
  }
}
