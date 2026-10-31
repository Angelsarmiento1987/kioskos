import test from 'node:test';
import assert from 'node:assert/strict';
import {operationErrorMessage} from '../src/operation-errors.js';
test('a write denied by Firestore gives rules guidance',()=>assert.match(operationErrorMessage({code:'permission-denied'}),/firestore.rules/));
test('a connection error identifies Firestore',()=>assert.match(operationErrorMessage({code:'unavailable'}),/Firestore/));
test('a timeout asks to check persistence before retrying',()=>assert.match(operationErrorMessage({code:'deadline-exceeded'}),/Actualizá la lista/));
test('business errors preserve their explanation',()=>assert.equal(operationErrorMessage({message:'Ese email ya tiene kiosko.'}),'Ese email ya tiene kiosko.'));
