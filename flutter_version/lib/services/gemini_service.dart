import 'dart:convert';
import 'dart:typed_data'; // Added this
import 'package:google_generative_ai/google_generative_ai.dart';
import '../models/detection.dart';

class GeminiService {
  final String apiKey;

  GeminiService(this.apiKey);

  Future<List<Detection>> detectPhotos(List<int> imageBytes, String mimeType) async {
    final model = GenerativeModel(
      model: 'gemini-1.5-flash',
      apiKey: apiKey,
      systemInstruction: Content.system("Tu es un outil d'intelligence artificielle spécialisé dans la détection géométrique d'images, l'analyse de scène de photos individuelles à partir de scans, et le détourage précis de clichés."),
    );

    final prompt = 'Tu es un expert en traitement d\'image, en analyse sémantique de scènes et en détourage de clichés.\n'
        'Analyse en détail l\'image fournie qui représente une planche, un album ou un scan contenant plusieurs photos ou polaroïds imprimés.\n\n'
        'Détecte chaque photo individuelle présente sur cette planche et identifie précisément sa boîte englobante (bounding box).\n'
        'Pour CHAQUE photo détectée :\n'
        '1. Analyse très finement le contenu visuel représenté à l\'intérieur de sa boîte englobante.\n'
        '2. Attribue-lui un titre sémantique, descriptif et poétique en français pour le paramètre "label".\n'
        '3. Suggère un nom de fichier logique, nettoyé et optimisé au format kebab-case ou snake-case pour le paramètre "suggested_filename".\n\n'
        'Retourne les coordonnées de découpe sous forme de coordonnées normalisées de 0 à 1000 dans la structure JSON demandée. [ymin, xmin, ymax, xmax].';

    final responseSchema = Schema.array(
      items: Schema.object(
        properties: {
          'box_2d': Schema.array(items: Schema.integer(), description: 'Les coordonnées [ymin, xmin, ymax, xmax] normalisées de la photo entre 0 et 1000.'),
          'label': Schema.string(description: 'Un titre descriptif, beau et unique basé sur le contenu visuel réel détecté dans le cliché en français.'),
          'suggested_filename': Schema.string(description: 'Un nom de fichier suggéré sans accents ni caractères spéciaux, tout en minuscule, séparé par des tirets (kebab-case).'),
        },
        requiredProperties: ['box_2d', 'label', 'suggested_filename'],
      ),
    );

    final content = [
      Content.multi([
        TextPart(prompt),
        DataPart(mimeType, Uint8List.fromList(imageBytes)),
      ])
    ];

    final response = await model.generateContent(
      content,
      generationConfig: GenerationConfig(
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      ),
    );

    final text = response.text;
    if (text == null) return [];

    final List<dynamic> jsonList = jsonDecode(text);
    return jsonList.asMap().entries.map((entry) {
      final idx = entry.key;
      final json = entry.value;
      return Detection.fromJson(json, 'crop-ai-$idx-${DateTime.now().millisecondsSinceEpoch}');
    }).toList();
  }
}
