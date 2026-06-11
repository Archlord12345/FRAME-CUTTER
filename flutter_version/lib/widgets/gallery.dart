import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import 'photo_card.dart';

class Gallery extends StatelessWidget {
  const Gallery({super.key});

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();
    final photos = appProvider.croppedPhotos;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "PHOTOS DÉCOUPÉES / GALERIE",
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
              if (photos.isNotEmpty)
                ElevatedButton.icon(
                  onPressed: () {}, // Download all simulation
                  icon: const Icon(Icons.download, size: 16),
                  label: Text("Télécharger Tout (${photos.length})"),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (photos.isEmpty)
             const Center(child: Text("Votre galerie est vide"))
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 300,
                childAspectRatio: 0.8,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: photos.length,
              itemBuilder: (context, index) => PhotoCard(photo: photos[index]),
            ),
        ],
      ),
    );
  }
}
