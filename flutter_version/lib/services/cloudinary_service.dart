import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:crypto/crypto.dart';

class CloudinaryService {
  Future<Map<String, dynamic>> uploadImage({
    required Uint8List bytes,
    required String cloudName,
    required String uploadPreset,
    String? folder,
    String? publicId,
  }) async {
    final url = Uri.parse('https://api.cloudinary.com/v1_1/$cloudName/image/upload');

    final request = http.MultipartRequest('POST', url);
    request.fields['upload_preset'] = uploadPreset;
    if (folder != null) request.fields['folder'] = folder;
    if (publicId != null) request.fields['public_id'] = publicId;

    request.files.add(http.MultipartFile.fromBytes(
      'file',
      bytes,
      filename: 'upload.jpg',
    ));

    final response = await request.send();
    final responseData = await response.stream.bytesToString();

    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(responseData);
    } else {
      throw Exception('Cloudinary upload failed: $responseData');
    }
  }
}
