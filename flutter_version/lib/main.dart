import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'providers/app_provider.dart';
import 'widgets/header.dart';
import 'widgets/workspace.dart';
import 'widgets/gallery.dart';
import 'widgets/grid_slicer_panel.dart';
import 'widgets/cloudinary_config_panel.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppProvider(),
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cutter.AI Desktop',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
        fontFamily: 'Inter',
      ),
      home: const MainScreen(),
    );
  }
}

class MainScreen extends StatelessWidget {
  const MainScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          const Header(),
          Expanded(
            child: appProvider.sourceImage == null
                ? _buildLandingPage(context, appProvider)
                : _buildWorkspace(appProvider),
          ),
        ],
      ),
    );
  }

  Widget _buildLandingPage(BuildContext context, AppProvider appProvider) {
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600),
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.uploadCloud, size: 64, color: Colors.indigo),
            const SizedBox(height: 24),
            const Text(
              "Découpez vos planches de photos en un clin d'œil",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            const Text(
              "Importez un scan de vieil album, une planche d'identité, une mosaïque de photos ou de polaroïds. L'IA s'occupe du reste.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: () async {
                FilePickerResult? result = await FilePicker.platform.pickFiles(type: FileType.image);
                if (result != null) {
                  final file = result.files.first;
                  if (file.path != null) {
                    final bytes = await File(file.path!).readAsBytes();
                    appProvider.setSourceImage(bytes, "image/jpeg");
                  } else if (file.bytes != null) {
                    appProvider.setSourceImage(file.bytes!, "image/jpeg");
                  }
                }
              },
              icon: const Icon(LucideIcons.plus),
              label: const Text("Sélectionner un fichier"),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWorkspace(AppProvider appProvider) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 8,
          child: SingleChildScrollView(
            child: Column(
              children: [
                const SizedBox(height: 450, child: Workspace()),
                const Gallery(),
              ],
            ),
          ),
        ),
        Expanded(
          flex: 4,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border(left: BorderSide(color: Colors.grey.shade200)),
            ),
            child: const SingleChildScrollView(
              child: Column(
                children: [
                  GridSlicerPanel(),
                  SizedBox(height: 16),
                  CloudinaryConfigPanel(),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
