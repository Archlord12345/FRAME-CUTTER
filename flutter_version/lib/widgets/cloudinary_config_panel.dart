import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../providers/app_provider.dart';

class CloudinaryConfigPanel extends StatefulWidget {
  const CloudinaryConfigPanel({super.key});

  @override
  State<CloudinaryConfigPanel> createState() => _CloudinaryConfigPanelState();
}

class _CloudinaryConfigPanelState extends State<CloudinaryConfigPanel> {
  late TextEditingController _nameController;
  late TextEditingController _presetController;
  late TextEditingController _folderController;

  @override
  void initState() {
    super.initState();
    final provider = context.read<AppProvider>();
    _nameController = TextEditingController(text: provider.cloudinaryCloudName);
    _presetController = TextEditingController(text: provider.cloudinaryUploadPreset);
    _folderController = TextEditingController(text: provider.cloudinaryFolder);
  }

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(LucideIcons.cloud, size: 16, color: Colors.indigo),
              SizedBox(width: 8),
              Text("Sauvegarde Cloudinary", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 16),
          _buildInput("Cloud Name", _nameController),
          _buildInput("Upload Preset", _presetController),
          _buildInput("Dossier", _folderController),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => appProvider.saveCloudinaryConfig(
              _nameController.text,
              _presetController.text,
              _folderController.text,
            ),
            style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
            child: const Text("Enregistrer Config"),
          ),
          if (appProvider.croppedPhotos.isNotEmpty) ...[
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: appProvider.uploadAllToCloudinary,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.indigo,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 40),
              ),
              child: const Text("Héberger tout"),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInput(String label, TextEditingController controller) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            style: const TextStyle(fontSize: 12),
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      ),
    );
  }
}
