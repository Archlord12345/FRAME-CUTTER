import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../providers/app_provider.dart';

class Header extends StatelessWidget {
  const Header({super.key});

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();

    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          _buildLogo(),
          const SizedBox(width: 12),
          _buildTitle(),
          const Spacer(),
          if (appProvider.sourceImage != null) ...[
            _buildActionButtons(context, appProvider),
          ],
        ],
      ),
    );
  }

  Widget _buildLogo() {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: Colors.indigo,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.white, width: 2),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ),
    );
  }

  Widget _buildTitle() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: const TextSpan(
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black),
            children: [
              TextSpan(text: "CUTTER"),
              TextSpan(text: ".AI", style: TextStyle(color: Colors.indigo)),
            ],
          ),
        ),
        Text(
          "ANALYSE GÉOMÉTRIQUE ACTIVE",
          style: TextStyle(fontSize: 10, color: Colors.grey.shade400, fontWeight: FontWeight.bold, letterSpacing: 1.2),
        ),
      ],
    );
  }

  Widget _buildActionButtons(BuildContext context, AppProvider appProvider) {
    return Row(
      children: [
        _HeaderButton(
          label: "Détecter IA ✨",
          icon: LucideIcons.sparkles,
          color: Colors.indigo,
          onPressed: () => _showApiKeyDialog(context, appProvider),
          isLoading: appProvider.isLoading,
        ),
        const SizedBox(width: 8),
        _HeaderButton(
          label: "Ajouter cadre",
          icon: LucideIcons.plus,
          color: Colors.white,
          textColor: Colors.black,
          onPressed: appProvider.addManualFrame,
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: const Icon(LucideIcons.rotateCcw, size: 18),
          onPressed: appProvider.reset,
          tooltip: "Nouvelle planche",
        ),
      ],
    );
  }

  void _showApiKeyDialog(BuildContext context, AppProvider appProvider) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Clé API Gemini"),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: "Saisissez votre clé API"),
          obscureText: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Annuler")),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              appProvider.detectPhotos(controller.text);
            },
            child: const Text("Lancer la détection"),
          ),
        ],
      ),
    );
  }
}

class _HeaderButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final Color? textColor;
  final VoidCallback onPressed;
  final bool isLoading;

  const _HeaderButton({
    required this.label,
    required this.icon,
    required this.color,
    this.textColor,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: isLoading ? null : onPressed,
      icon: isLoading
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : Icon(icon, size: 16),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: textColor ?? Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}
