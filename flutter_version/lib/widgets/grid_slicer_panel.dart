import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../providers/app_provider.dart';

class GridSlicerPanel extends StatefulWidget {
  const GridSlicerPanel({super.key});

  @override
  State<GridSlicerPanel> createState() => _GridSlicerPanelState();
}

class _GridSlicerPanelState extends State<GridSlicerPanel> {
  int rows = 3;
  int cols = 2;
  double margin = 5;
  double widthFactor = 0.9;
  double heightFactor = 0.9;

  @override
  Widget build(BuildContext context) {
    final appProvider = context.read<AppProvider>();

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
          Row(
            children: [
              Icon(LucideIcons.grid, size: 16, color: Colors.teal.shade400),
              const SizedBox(width: 8),
              const Text("Découpe en Grille", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 16),
          _buildSlider("Lignes", rows.toDouble(), 1, 10, (v) => setState(() => rows = v.toInt())),
          _buildSlider("Colonnes", cols.toDouble(), 1, 10, (v) => setState(() => cols = v.toInt())),
          _buildSlider("Marge (%)", margin, 0, 30, (v) => setState(() => margin = v)),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => appProvider.applyGrid(rows, cols, margin, widthFactor, heightFactor),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.teal.shade400,
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 40),
            ),
            child: const Text("Lancer la Découpe"),
          ),
        ],
      ),
    );
  }

  Widget _buildSlider(String label, double value, double min, double max, ValueChanged<double> onChanged) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
            Text(value.toStringAsFixed(0), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
        Slider(
          value: value,
          min: min,
          max: max,
          onChanged: onChanged,
          activeColor: Colors.teal.shade400,
        ),
      ],
    );
  }
}
