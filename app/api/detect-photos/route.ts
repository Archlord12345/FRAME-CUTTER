import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Initialize Gemini client according to the guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
    }

    // Clean base64 string
    const match = image.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    let mimeType = "image/jpeg";
    let base64Data = image;

    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    const promptText = `Tu es un expert en traitement d'image, en analyse sémantique de scènes et en détourage de clichés.
Analyse en détail l'image fournie qui représente une planche, un album ou un scan contenant plusieurs photos ou polaroïds imprimés.

Détecte chaque photo individuelle présente sur cette planche et identifie précisément sa boîte englobante (bounding box).
Pour CHAQUE photo détectée :
1. Analyse très finement le contenu visuel représenté à l'intérieur de sa boîte englobante (par exemple : s'il s'agit d'un chalet sous un coucher de soleil chaleureux, d'une plage paradisiaque aux eaux transparentes, d'un chat tacheté, d'un repas de famille, de ruines de temples, de portraits rétro d'hommes/femmes, etc.).
2. Attribue-lui un titre sémantique, descriptif et poétique en français (ex. "Chalet sous Coucher de Soleil", "Plage Tropicale Céleste", "Portrait Retro Élégant") pour le paramètre "label". Ne mets jamais de noms génériques ou numérotés comme "Photo 1" ou "Cliché". Nomme-les toujours en fonction de la scène réelle !
3. Suggère un nom de fichier logique, nettoyé et optimisé au format kebab-case ou snake-case en minuscules sans accent (ex. "chalet_sunset_retro", "plage_tropicale_bleue") pour le paramètre "suggested_filename".

Retourne les coordonnées de découpe sous forme de coordonnées normalisées de 0 à 1000 dans la structure JSON demandée. [ymin, xmin, ymax, xmax].
Assure-toi que les boîtes englobantes soient bien serrées sur les clichés pour éliminer tout fond blanc d'arrière-plan ou bordure.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [imagePart, promptText],
      config: {
        systemInstruction: "Tu es un outil d'intelligence artificielle spécialisé dans la détection géométrique d'images, l'analyse de scène de photos individuelles à partir de scans, et le détourage précis de clichés.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              box_2d: {
                type: Type.ARRAY,
                items: {
                  type: Type.INTEGER,
                },
                description: "Les coordonnées [ymin, xmin, ymax, xmax] normalisées de la photo entre 0 et 1000.",
              },
              label: {
                type: Type.STRING,
                description: "Un titre descriptif, beau et unique basé sur le contenu visuel réel détecté dans le cliché en français.",
              },
              suggested_filename: {
                type: Type.STRING,
                description: "Un nom de fichier suggéré sans accents ni caractères spéciaux, tout en minuscule, séparé par des tirets (kebab-case).",
              },
            },
            required: ["box_2d", "label", "suggested_filename"],
          },
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("L'IA n'a retourné aucune coordonnée.");
    }

    const photos = JSON.parse(responseText.trim());
    return NextResponse.json({ success: true, photos });

  } catch (error: any) {
    console.error("Erreur détection photos:", error);
    return NextResponse.json({ 
      error: error.message || "Une erreur est survenue lors de la détection par l'IA." 
    }, { status: 500 });
  }
}
