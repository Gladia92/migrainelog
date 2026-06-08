; installer.nsh — inclus par electron-builder dans le script NSIS.
; Importe le certificat public MigraineLog dans les magasins de confiance
; de l'UTILISATEUR courant (pas besoin d'admin), pour que l'application
; signée n'apparaisse plus comme "éditeur inconnu" sur le PC cible.
;
; Le fichier MigraineLog.cer est embarqué via "extraResources" (package.json)
; et se retrouve dans $INSTDIR\resources\MigraineLog.cer.

!macro customInstall
  ; -user : magasin de l'utilisateur courant -> aucune élévation requise
  ; Root  : rend la chaîne de signature valide (plus d'avertissement éditeur)
  ; TrustedPublisher : évite l'invite SmartScreen/UAC pour cet éditeur
  nsExec::Exec 'certutil -user -addstore -f "Root" "$INSTDIR\resources\MigraineLog.cer"'
  nsExec::Exec 'certutil -user -addstore -f "TrustedPublisher" "$INSTDIR\resources\MigraineLog.cer"'
!macroend

!macro customUnInstall
  ; Retire le certificat de confiance à la désinstallation
  nsExec::Exec 'certutil -user -delstore "Root" "MigraineLog"'
  nsExec::Exec 'certutil -user -delstore "TrustedPublisher" "MigraineLog"'
!macroend
