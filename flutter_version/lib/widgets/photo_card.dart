import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import '../models/cropped_photo.dart';
import '../providers/app_provider.dart';

class PhotoCard extends StatelessWidget {
  final CroppedPhoto photo;

  const PhotoCard({super.key, required this.photo});

  @override
  Widget build(BuildContext context) {
    final appProvider = context.read<AppProvider>();

    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Container(
              color: Colors.grey.shade50,
              padding: const EdgeInsets.all(8),
              child: Image.memory(photo.bytes, fit: BoxFit.contain),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(),
                const SizedBox(height: 8),
                _buildLabelInput(appProvider),
                const SizedBox(height: 12),
                _buildActions(context, appProvider),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          "Cliché",
          style: TextStyle(fontSize: 10, color: Colors.grey.shade400, fontWeight: FontWeight.bold),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.indigo.shade50,
            borderRadius: BorderRadius.circular(4),
          ),
          child: const Text(
            "IA : Nom Détecté",
            style: TextStyle(fontSize: 8, color: Colors.indigo, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }

  Widget _buildLabelInput(AppProvider appProvider) {
    return TextField(
      controller: TextEditingController(text: photo.label),
      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
      decoration: InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        fillColor: Colors.grey.shade100,
        filled: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
      ),
      onSubmitted: (val) => appProvider.updateDetectionField(photo.id, label: val),
    );
  }

  Widget _buildActions(BuildContext context, AppProvider appProvider) {
    return Row(
      children: [
        IconButton(
          icon: const Icon(LucideIcons.sliders, size: 16),
          onPressed: () => _showFilterDialog(appProvider),
          tooltip: "Filtres",
        ),
        const Spacer(),
        IconButton(
          icon: const Icon(LucideIcons.trash2, size: 16),
          onPressed: () => appProvider.deleteCrop(photo.id),
          tooltip: "Supprimer",
        ),
        const SizedBox(width: 4),
        ElevatedButton(
          onPressed: () => _savePhoto(context),
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            visualDensity: VisualDensity.compact,
          ),
          child: const Text("Enregistrer", style: TextStyle(fontSize: 11)),
        ),
      ],
    );
  }

  Future<void> _savePhoto(BuildContext context) async {
    try {
      final directory = await getApplicationDocumentsDirectory();
      final name = photo.detection.suggestedFilename.replaceAll(' ', '_');
      final path = '${directory.path}/$name.jpg';
      final file = File(path);
      await file.writeAsBytes(photo.bytes);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Photo enregistrée dans: $path')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur lors de l\'enregistrement: $e')),
        );
      }
    }
  }

  void _showFilterDialog(AppProvider appProvider) {
    // UI filters implementation omitted for brevity in this fix
  }
}
