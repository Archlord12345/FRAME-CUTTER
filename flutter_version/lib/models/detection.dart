class Detection {
  final String id;
  final List<int> box2d; // [ymin, xmin, ymax, xmax] - 0 to 1000
  final String label;
  final String suggestedFilename;
  final int rotation; // 0, 90, 180, 270
  final double brightness; // 1.0 is normal (equivalent to 100 in JS)
  final double contrast; // 1.0 is normal
  final bool grayscale;
  final bool sepia;
  final bool customized;

  Detection({
    required this.id,
    required this.box2d,
    required this.label,
    required this.suggestedFilename,
    this.rotation = 0,
    this.brightness = 1.0,
    this.contrast = 1.0,
    this.grayscale = false,
    this.sepia = false,
    this.customized = false,
  });

  Detection copyWith({
    String? id,
    List<int>? box2d,
    String? label,
    String? suggestedFilename,
    int? rotation,
    double? brightness,
    double? contrast,
    bool? grayscale,
    bool? sepia,
    bool? customized,
  }) {
    return Detection(
      id: id ?? this.id,
      box2d: box2d ?? this.box2d,
      label: label ?? this.label,
      suggestedFilename: suggestedFilename ?? this.suggestedFilename,
      rotation: rotation ?? this.rotation,
      brightness: brightness ?? this.brightness,
      contrast: contrast ?? this.contrast,
      grayscale: grayscale ?? this.grayscale,
      sepia: sepia ?? this.sepia,
      customized: customized ?? this.customized,
    );
  }

  factory Detection.fromJson(Map<String, dynamic> json, String id) {
    return Detection(
      id: id,
      box2d: List<int>.from(json['box_2d']),
      label: json['label'],
      suggestedFilename: json['suggested_filename'],
    );
  }
}
